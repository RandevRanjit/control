import {
  type CustomModelSetting,
  type ModelCapabilities,
  type ModelSelection,
  ProviderDriverKind,
  type ServerProviderModel,
} from "@control/contracts";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import * as Option from "effect/Option";
import {
  getModelSelectionStringOptionValue,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  readCustomModelEntries,
} from "@control/shared/model";
import { compareSemverVersions } from "@control/shared/semver";

import {
  type ClaudeCodeCompatibility,
  type ClaudeCodeProfile,
  decodeClaudeModelAdapter,
  decodeClaudeProfileAdapter,
} from "./ClaudeModelManifest.ts";
import {
  BUNDLED_MODEL_MANIFEST,
  type ModelManifestData,
  resolveProviderCatalog,
} from "./ModelManifest.ts";

const CLAUDE = ProviderDriverKind.make("claudeAgent");
const EMPTY_CAPABILITIES: ModelCapabilities = { optionDescriptors: [] };

export interface ClaudeCatalogModel {
  readonly model: ServerProviderModel;
  readonly runtime: ClaudeCodeProfile;
  readonly compatibility: ClaudeCodeCompatibility;
}

export interface ClaudeModelCatalog {
  readonly models: ReadonlyArray<ClaudeCatalogModel>;
}

function tryResolveClaudeModelCatalog(manifest: ModelManifestData): ClaudeModelCatalog | null {
  const resolved = resolveProviderCatalog(manifest, CLAUDE);
  if (!resolved) return null;

  const models: Array<ClaudeCatalogModel> = [];
  for (const entry of resolved.models) {
    const profile = decodeClaudeProfileAdapter(entry.profileAdapter ?? {});
    const adapter = decodeClaudeModelAdapter(entry.adapter ?? {});
    if (Option.isNone(profile) || Option.isNone(adapter)) return null;
    models.push({
      model: entry.model,
      runtime: profile.value.claudeCode ?? {},
      compatibility: adapter.value.claudeCode ?? {},
    });
  }

  return {
    models,
  };
}

export function resolveClaudeModelCatalog(manifest: ModelManifestData): ClaudeModelCatalog {
  return (
    tryResolveClaudeModelCatalog(manifest) ??
    tryResolveClaudeModelCatalog(BUNDLED_MODEL_MANIFEST) ?? {
      models: [],
    }
  );
}

export const BUNDLED_CLAUDE_MODEL_CATALOG = resolveClaudeModelCatalog(BUNDLED_MODEL_MANIFEST);

const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

/** `claude-fable-5-2` → `claude-fable`: models of one line share Control's options for it. */
const modelFamily = (slug: string) => slug.replace(/(-\d+)+$/, "");

/** `claude-fable-5-2` → `Claude Fable 5.2`, the manifest's naming. */
const modelName = (slug: string) => {
  const parts = slug.split("-");
  const words = parts.filter((part) => !/^\d+$/.test(part));
  const version = parts.filter((part) => /^\d+$/.test(part)).join(".");
  return [...words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)), version]
    .filter((part) => part !== "")
    .join(" ");
};

/**
 * The installed Claude decides which models are current, from the rows it reports at start-up
 * (`initializationResult().models`): a model it reports that the manifest lacks joins with its
 * line's options (Fable 5.2 takes Fable 5.1's), or with the effort levels and fast mode it reports
 * for a new line; manifest models it no longer reports move to the older models; its aliases
 * (`fable`) point where it says. Rows without a plain `resolvedModel` id (older CLIs, a suffixed
 * variant such as `[1m]`) change nothing.
 */
export function withInstalledClaudeModels(
  catalog: ClaudeModelCatalog,
  reported: ReadonlyArray<ModelInfo>,
): ClaudeModelCatalog {
  const rows = reported.filter((row) => /^claude-[a-z0-9-]+$/.test(row.resolvedModel ?? ""));
  if (rows.length === 0) return catalog;
  const reportedSlugs = new Set(rows.map((row) => row.resolvedModel!));
  const aliasTarget = new Map(
    rows
      .filter((row) => row.value !== "default" && row.value !== row.resolvedModel)
      .map((row) => [row.value.toLowerCase(), row.resolvedModel!]),
  );
  const known = new Set(catalog.models.map((entry) => entry.model.slug));

  const added: Array<ClaudeCatalogModel> = [];
  for (const row of rows) {
    const slug = row.resolvedModel!;
    if (known.has(slug)) continue;
    known.add(slug);
    const family = catalog.models.filter(
      (entry) => !entry.model.isCustom && modelFamily(entry.model.slug) === modelFamily(slug),
    );
    const predecessor = family.find((entry) => !entry.model.isLegacy) ?? family[0];
    const levels = row.supportedEffortLevels ?? [];
    added.push({
      model: {
        slug,
        name: modelName(slug),
        badge: "new",
        isCustom: false,
        capabilities: predecessor?.model.capabilities ?? {
          optionDescriptors: [
            ...(levels.length === 0
              ? []
              : [
                  {
                    id: "effort",
                    label: "Reasoning",
                    type: "select" as const,
                    options: levels.map((id) => ({ id, label: EFFORT_LABELS[id] ?? id })),
                  },
                ]),
            ...(row.supportsFastMode
              ? [{ id: "fastMode", label: "Fast Mode", type: "boolean" as const }]
              : []),
          ],
        },
      },
      runtime: predecessor?.runtime ?? {},
      compatibility: {},
    });
  }

  const models = [...added, ...catalog.models].map((entry): ClaudeCatalogModel => {
    if (entry.model.isCustom) return entry;
    const { isLegacy: _isLegacy, aliases: currentAliases, ...model } = entry.model;
    const aliases = [
      ...(currentAliases ?? []).filter((alias) => {
        const target = aliasTarget.get(alias.toLowerCase());
        return target === undefined || target === model.slug;
      }),
      ...[...aliasTarget]
        .filter(
          ([alias, target]) =>
            target === model.slug &&
            !currentAliases?.some((existing) => existing.toLowerCase() === alias),
        )
        .map(([alias]) => alias),
    ];
    return {
      ...entry,
      model: {
        ...model,
        ...(aliases.length > 0 ? { aliases } : {}),
        ...(reportedSlugs.has(model.slug) ? {} : { isLegacy: true }),
      },
    };
  });
  return { models };
}

/**
 * Scope the catalog to one instance's settings: custom model slugs stay opaque
 * (a built-in alias they shadow is dropped, canonical slugs and capabilities
 * are preserved), and custom entries that declare their own capabilities are
 * appended so the adapter resolves effort / fast mode / thinking against the
 * user's descriptors instead of the empty default. Custom entries carry no
 * runtime profile, so option values pass through to Claude Code verbatim.
 */
export function scopeClaudeModelCatalog(
  catalog: ClaudeModelCatalog,
  customModels: ReadonlyArray<CustomModelSetting>,
): ClaudeModelCatalog {
  const customEntries = readCustomModelEntries(customModels);
  if (customEntries.length === 0) return catalog;
  const customAliases = new Set(customEntries.map((entry) => entry.slug.toLowerCase()));

  const builtInModels = catalog.models.map((entry) => {
    if (!entry.model.aliases?.some((alias) => customAliases.has(alias.toLowerCase()))) {
      return entry;
    }
    return {
      ...entry,
      model: {
        ...entry.model,
        aliases: entry.model.aliases.filter((alias) => !customAliases.has(alias.toLowerCase())),
      },
    };
  });
  const builtInSlugs = new Set(builtInModels.map((entry) => entry.model.slug));
  const customCatalogModels: Array<ClaudeCatalogModel> = [];
  for (const entry of customEntries) {
    if (!entry.capabilities || builtInSlugs.has(entry.slug)) continue;
    customCatalogModels.push({
      model: {
        slug: entry.slug,
        name: entry.name,
        isCustom: true,
        capabilities: entry.capabilities,
      },
      runtime: {},
      compatibility: {},
    });
  }

  return { models: [...builtInModels, ...customCatalogModels] };
}

function resolveClaudeCatalogModel(
  catalog: ClaudeModelCatalog,
  slugOrAlias: string | null | undefined,
): ClaudeCatalogModel | undefined {
  const value = slugOrAlias?.trim();
  if (!value) return undefined;
  return (
    catalog.models.find((entry) => entry.model.slug === value) ??
    catalog.models.find((entry) =>
      entry.model.aliases?.some((alias) => alias.toLowerCase() === value.toLowerCase()),
    )
  );
}

export function resolveClaudeModelSlug(catalog: ClaudeModelCatalog, slugOrAlias: string): string {
  return resolveClaudeCatalogModel(catalog, slugOrAlias)?.model.slug ?? slugOrAlias;
}

export function getClaudeCatalogModelCapabilities(
  catalog: ClaudeModelCatalog,
  slugOrAlias: string | null | undefined,
): ModelCapabilities {
  return resolveClaudeCatalogModel(catalog, slugOrAlias)?.model.capabilities ?? EMPTY_CAPABILITIES;
}

function isVersionSupported(
  compatibility: ClaudeCodeCompatibility,
  version: string | null | undefined,
): boolean {
  if (!compatibility.minVersion && !compatibility.maxVersionExclusive) return true;
  if (!version) return false;
  if (compatibility.minVersion && compareSemverVersions(version, compatibility.minVersion) < 0) {
    return false;
  }
  return !(
    compatibility.maxVersionExclusive &&
    compareSemverVersions(version, compatibility.maxVersionExclusive) >= 0
  );
}

export function resolveClaudeModelsForVersion(
  catalog: ClaudeModelCatalog,
  version: string | null | undefined,
): ReadonlyArray<ClaudeCatalogModel["model"]> {
  return catalog.models
    .filter((entry) => isVersionSupported(entry.compatibility, version))
    .map((entry) => entry.model);
}

export function formatClaudeVersionUpgradeMessage(
  catalog: ClaudeModelCatalog,
  version: string | null,
): string | undefined {
  const unavailable = catalog.models
    .filter(
      (entry) =>
        entry.compatibility.minVersion &&
        (!version || compareSemverVersions(version, entry.compatibility.minVersion) < 0),
    )
    .toSorted((left, right) =>
      compareSemverVersions(left.compatibility.minVersion!, right.compatibility.minVersion!),
    )[0];
  if (!unavailable?.compatibility.minVersion) return undefined;
  const versionLabel = version ? `v${version}` : "the installed version";
  return `Claude Code ${versionLabel} is too old for ${unavailable.model.name}. Upgrade to v${unavailable.compatibility.minVersion} or newer to access it.`;
}

export function resolveClaudeCatalogEffort(
  catalog: ClaudeModelCatalog,
  model: string | null | undefined,
  raw: string | null | undefined,
): string | undefined {
  const caps = getClaudeCatalogModelCapabilities(catalog, model);
  const descriptors = getProviderOptionDescriptors({
    caps,
    ...(raw ? { selections: [{ id: "effort", value: raw }] } : {}),
  });
  const descriptor = descriptors.find((candidate) => candidate.id === "effort");
  const value = getProviderOptionCurrentValue(descriptor);
  return typeof value === "string" ? value : undefined;
}

export function normalizeClaudeCatalogEffort(
  catalog: ClaudeModelCatalog,
  effort: string | null | undefined,
  model: string | null | undefined,
): string | undefined {
  if (!effort) return undefined;
  const effortMap = resolveClaudeCatalogModel(catalog, model)?.runtime.effortMap;
  if (!effortMap || !Object.prototype.hasOwnProperty.call(effortMap, effort)) return effort;
  return effortMap[effort] ?? undefined;
}

export function isClaudeCatalogUltracodeEffort(effort: string | null | undefined): boolean {
  return effort === "ultracode";
}

function resolveClaudeCatalogContextWindow(
  catalog: ClaudeModelCatalog,
  modelSelection: ModelSelection | undefined,
): string | undefined {
  const caps = getClaudeCatalogModelCapabilities(catalog, modelSelection?.model);
  const raw = getModelSelectionStringOptionValue(modelSelection, "contextWindow");
  const descriptors = getProviderOptionDescriptors({
    caps,
    ...(raw ? { selections: [{ id: "contextWindow", value: raw }] } : {}),
  });
  const descriptor = descriptors.find((candidate) => candidate.id === "contextWindow");
  const value = getProviderOptionCurrentValue(descriptor);
  return typeof value === "string" ? value : undefined;
}

export function resolveClaudeCatalogApiModelId(
  catalog: ClaudeModelCatalog,
  modelSelection: ModelSelection,
): string {
  const entry = resolveClaudeCatalogModel(catalog, modelSelection.model);
  const slug = entry?.model.slug ?? modelSelection.model;
  const descriptors = getProviderOptionDescriptors({
    caps: entry?.model.capabilities ?? EMPTY_CAPABILITIES,
    selections: modelSelection.options,
  });
  for (const [optionId, suffixes] of Object.entries(entry?.runtime.modelSuffixes ?? {})) {
    const value = getProviderOptionCurrentValue(
      descriptors.find((descriptor) => descriptor.id === optionId),
    );
    if (typeof value === "string" && suffixes[value]) return `${slug}${suffixes[value]}`;
  }
  return slug;
}

export function resolveClaudeCatalogContextWindowTokens(
  catalog: ClaudeModelCatalog,
  modelSelection: ModelSelection | undefined,
): number | undefined {
  const entry = resolveClaudeCatalogModel(catalog, modelSelection?.model);
  if (!entry) return undefined;
  if (entry.runtime.fixedContextWindowTokens) return entry.runtime.fixedContextWindowTokens;
  const contextWindow = resolveClaudeCatalogContextWindow(catalog, modelSelection);
  return contextWindow ? entry.runtime.contextWindowTokens?.[contextWindow] : undefined;
}

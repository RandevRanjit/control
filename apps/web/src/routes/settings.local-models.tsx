import { createFileRoute } from "@tanstack/react-router";

import { LocalModelsSettings } from "../components/localModels/LocalModelsSettings";

function SettingsLocalModelsRoute() {
  return <LocalModelsSettings />;
}

export const Route = createFileRoute("/settings/local-models")({
  component: SettingsLocalModelsRoute,
});

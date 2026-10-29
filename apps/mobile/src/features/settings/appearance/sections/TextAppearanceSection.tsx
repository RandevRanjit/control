import {
  BASE_FONT_SIZE_STEP,
  MAX_BASE_FONT_SIZE,
  MIN_BASE_FONT_SIZE,
} from "../../../../lib/appearancePreferences";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";
import {
  AppearancePreviewSeparator,
  TextAppearancePreview,
} from "../components/AppearancePreviews";
import { FontSizeSliderRow } from "../components/FontSizeSliderRow";

export function TextAppearanceSection() {
  const { isReady, appearance, setBaseFontSize, mathRenderingEnabled, setMathRenderingEnabled } =
    useAppearancePreferences();

  return (
    <SettingsSection title="Text">
      <TextAppearancePreview fontSize={appearance.baseFontSize} />
      <AppearancePreviewSeparator />
      <FontSizeSliderRow
        disabled={!isReady}
        icon="textformat.size"
        label="Text size"
        max={MAX_BASE_FONT_SIZE}
        min={MIN_BASE_FONT_SIZE}
        onChange={setBaseFontSize}
        step={BASE_FONT_SIZE_STEP}
        value={appearance.baseFontSize}
        valueLabel={`${appearance.baseFontSize} pt`}
      />
      <SettingsSwitchRow
        disabled={!isReady}
        icon="x.squareroot"
        label="Render math"
        onValueChange={setMathRenderingEnabled}
        value={mathRenderingEnabled}
      />
    </SettingsSection>
  );
}

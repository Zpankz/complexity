import { Switch } from "@/components/ui/switch";
import { registerSettingsUi } from "@/entrypoints/contexts/options-page/routes/dashboard/pages/plugins/components/plugin-settings-uis/registry";
import { useSettings } from "@/plugins/restore-search-mode-selector/settings";

function SettingsUi() {
  const { settings, update } = useSettings();
  return (
    <div className="x:flex x:flex-col x:gap-4">
      <Switch
        textLabel="Enable"
        checked={settings.enabled}
        onCheckedChange={({ checked }) => {
          void update({
            updateFn(prev) {
              prev.enabled = checked;
            },
          });
        }}
      />
      <p>
        Reload Perplexity after changing this setting. Restores the home Search
        dropdown only when its native menu is missing. Existing Search chats get
        a Pro Research shortcut that invokes their native Included in Pro
        action. It does not force the home page into legacy Research. Perplexity
        still enforces your plan, organization restrictions and usage limits.
        This does not guarantee credit-free requests.
      </p>
    </div>
  );
}
export default function register() {
  registerSettingsUi({
    pluginId: "restoreSearchModeSelector",
    ui: <SettingsUi />,
  });
}

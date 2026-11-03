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
        Reload Perplexity after changing this setting. Restores missing mode
        menus on home and in chats that started in Search. Existing Search chats
        also get the native Included in Pro Research shortcut. Home Research may
        still route to Computer. Native plan and usage limits still apply.
      </p>
      <p>
        Council remembers exact ordered model IDs per Perplexity account and
        organization. It shows current model names and keeps selected models
        distinct from observed submitted runs. Unavailable saved models require
        confirmation instead of silently using defaults. Runs before
        installation cannot be assumed recorded.
      </p>
      <p>
        Skill file viewers offer Copy file as prompt context in raw Markdown or
        source view. Paste manually into Search or Research. Only that file is
        copied; supporting files, tools, credentials and dependencies are not
        installed. This is not native Computer skill execution.
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

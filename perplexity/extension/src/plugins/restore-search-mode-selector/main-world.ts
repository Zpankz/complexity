import { getCouncilMemoryBridge } from "@/plugins/restore-search-mode-selector/council-bridge";
import { installCouncilPreferences } from "@/plugins/restore-search-mode-selector/council-preferences";
import { installSearchModeMenu } from "@/plugins/restore-search-mode-selector/menu";
import { installProResearchShortcut } from "@/plugins/restore-search-mode-selector/pro-research";
import { installSkillContextCopy } from "@/plugins/restore-search-mode-selector/skill-context";

installSearchModeMenu();
installProResearchShortcut();
installSkillContextCopy();
installCouncilPreferences({ store: getCouncilMemoryBridge() });

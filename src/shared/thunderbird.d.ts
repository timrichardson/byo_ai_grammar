declare namespace browser.composeAction {
  type IconPath = string | Record<number, string>;

  function setLabel(details: { label: string; tabId?: number }): Promise<void>;
  function setTitle(details: { title: string; tabId?: number }): Promise<void>;
  function setIcon(details: { path: IconPath; tabId?: number }): Promise<void>;
  function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;

  const onClicked: browser.events.Event<(tab: browser.tabs.Tab) => void>;
}

declare namespace browser.scripting.compose {
  type RegisteredScript = {
    id: string;
    js: string[];
  };

  function registerScripts(scripts: RegisteredScript[]): Promise<void>;
}

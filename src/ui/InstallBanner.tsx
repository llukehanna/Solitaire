import { useEffect, useState } from 'react';
import { KEYS, readJSON, writeJSON } from '../store/storage';
import { installHintMode, isIOS } from './installHint';
import { usePhone } from './media';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallHint({ gamesPlayed }: { gamesPlayed: number }) {
  const phone = usePhone();
  const [dismissed, setDismissed] = useState(() => readJSON(KEYS.installHint) === true);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const dismiss = () => {
    writeJSON(KEYS.installHint, true);
    setDismissed(true);
  };
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's own mini-infobar from competing with ours
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      writeJSON(KEYS.installHint, true);
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const mode = installHintMode({
    phone,
    standalone: standalone(),
    dismissed,
    gamesPlayed,
    ios: isIOS(navigator.userAgent, navigator.maxTouchPoints),
    canPrompt: promptEvent !== null,
  });
  if (!mode) return null;
  return (
    <aside className="install-hint" aria-label="Install Solitaire">
      {mode === 'ios' ? (
        <p>Install: tap Share, then Add to Home Screen.</p>
      ) : (
        <>
          <p>Play offline from your home screen.</p>
          <button
            type="button"
            className="install-go"
            onClick={async () => {
              await promptEvent?.prompt();
              dismiss();
            }}
          >
            Install
          </button>
        </>
      )}
      <button type="button" className="install-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </aside>
  );
}

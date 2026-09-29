import type { Settings } from '../../store/settings';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
}

function Segmented<T extends string | number>(p: { label: string; value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <fieldset className="seg">
      <legend>{p.label}</legend>
      <div className="seg-row">
        {p.options.map(([v, text]) => (
          <button type="button" key={String(v)} aria-pressed={p.value === v} onClick={() => p.onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle(p: { label: string; checked: boolean; onChange(v: boolean): void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span>
        {p.label}
        {p.hint && <small>{p.hint}</small>}
      </span>
    </label>
  );
}

export function SettingsDialog({ open, settings: s, onChange, onClose }: Props) {
  return (
    <Modal open={open} title="Settings" onClose={onClose} actions={<button type="button" className="primary" onClick={onClose}>Done</button>}>
      <Segmented label="Draw" value={s.drawCount} options={[[1, 'Draw 1'], [3, 'Draw 3']]} onChange={(drawCount) => onChange({ drawCount })} />
      <Segmented
        label="Scoring"
        value={s.scoring}
        options={[['standard', 'Standard'], ['vegas', 'Vegas'], ['none', 'None']]}
        onChange={(scoring) => onChange({ scoring })}
      />
      {s.scoring === 'vegas' && (
        <>
          <p className="note">Vegas limits passes through the stock (1 in Draw 1, 3 in Draw 3), so deals may not be winnable.</p>
          <Toggle label="Cumulative Vegas bank" checked={s.cumulativeVegas} onChange={(cumulativeVegas) => onChange({ cumulativeVegas })} />
        </>
      )}
      <Toggle
        label="Auto-play to foundations"
        hint="Moves cards up automatically when it can never hurt"
        checked={s.autoPlay}
        onChange={(autoPlay) => onChange({ autoPlay })}
      />
      <Segmented label="Theme" value={s.theme} options={[['classic', 'Classic felt'], ['minimal', 'Modern minimal']]} onChange={(theme) => onChange({ theme })} />
      {s.theme === 'minimal' && (
        <Segmented
          label="Appearance"
          value={s.colorMode}
          options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]}
          onChange={(colorMode) => onChange({ colorMode })}
        />
      )}
      <Toggle label="Four-color deck" checked={s.fourColor} onChange={(fourColor) => onChange({ fourColor })} />
      <Toggle label="Left-handed layout" checked={s.leftHanded} onChange={(leftHanded) => onChange({ leftHanded })} />
      <Toggle label="Sound" checked={s.sound} onChange={(sound) => onChange({ sound })} />
      <Segmented
        label="Animation"
        value={s.animation}
        options={[['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']]}
        onChange={(animation) => onChange({ animation })}
      />
    </Modal>
  );
}

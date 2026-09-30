import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { CARD_BACKS, CLOTHS, TABLES, type CardBack, type Cloth, type Settings, type TableTheme } from '../../store/settings';
import { SUIT_PATHS } from '../cards/suits';
import { AppearancePreview } from './AppearancePreview';
import { Modal } from './Modal';
import { TilePicker, type TileOption } from './TilePicker';

interface Props {
  open: boolean;
  settings: Settings;
  /** A rules change (draw/scoring) was made mid-game and will only apply to the next one. */
  deferredNote: boolean;
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

const TABS = [
  ['appearance', 'Appearance'],
  ['game', 'Game'],
  ['controls', 'Controls'],
] as const;
type Tab = (typeof TABS)[number][0];

const TABLE_NAMES: Record<TableTheme, string> = { studio: 'Studio', felt: 'Felt', paper: 'Paper' };
const CLOTH_NAMES: Record<Cloth, string> = { fine: 'Fine', fibre: 'Fibre', baize: 'Baize', brushed: 'Brushed', casino: 'Casino' };
const BACK_NAMES: Record<CardBack, string> = { deco: 'Deco', amber: 'Amber', ink: 'Ink', oxblood: 'Oxblood', navy: 'Navy' };
const MINI_CARD = { '--card-w': '30px' } as CSSProperties;

const Suit = ({ s, color }: { s: 'S' | 'H' | 'D' | 'C'; color: string }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path d={SUIT_PATHS[s]} fill={color} />
  </svg>
);
const SUIT_INK = '#1c1a17';
const SUIT_RED = '#c2412d';
const suitThumb = (four: boolean): ReactNode => (
  <span className="thumb thumb-suits">
    <Suit s="S" color={SUIT_INK} />
    <Suit s="H" color={SUIT_RED} />
    <Suit s="C" color={four ? '#2e7d32' : SUIT_INK} />
    <Suit s="D" color={four ? '#1565c0' : SUIT_RED} />
  </span>
);

function AppearancePanel({ s, onChange }: { s: Settings; onChange(patch: Partial<Settings>): void }) {
  const tables: TileOption<TableTheme>[] = TABLES.map((t) => ({
    value: t,
    name: TABLE_NAMES[t],
    thumb: <span className={`thumb thumb-table textured table-${t} cloth-${s.cloth}`} />,
  }));
  const cloths: TileOption<Cloth>[] = CLOTHS.map((c) => ({
    value: c,
    name: CLOTH_NAMES[c],
    thumb: <span className={`thumb thumb-table textured table-felt cloth-${c}`} />,
  }));
  const backs: TileOption<CardBack>[] = CARD_BACKS.map((b) => ({
    value: b,
    name: BACK_NAMES[b],
    thumb: (
      <span className={`thumb thumb-back back-${b}`}>
        <span className="mini-card" style={MINI_CARD}>
          <span className="card-back" />
        </span>
      </span>
    ),
  }));
  const suits: TileOption<'two' | 'four'>[] = [
    { value: 'two', name: 'Two-colour', thumb: suitThumb(false) },
    { value: 'four', name: 'Four-colour', thumb: suitThumb(true) },
  ];
  return (
    <>
      <AppearancePreview table={s.table} />
      <TilePicker label="Table" value={s.table} options={tables} cols={3} onChange={(table) => onChange({ table })} />
      {s.table === 'felt' && <TilePicker label="Cloth" value={s.cloth} options={cloths} cols={5} onChange={(cloth) => onChange({ cloth })} />}
      <TilePicker label="Card back" value={s.cardBack} options={backs} cols={5} onChange={(cardBack) => onChange({ cardBack })} />
      <TilePicker label="Suit colours" value={s.fourColor ? 'four' : 'two'} options={suits} cols={2} onChange={(v) => onChange({ fourColor: v === 'four' })} />
      <Segmented
        label="Animation"
        value={s.animation}
        options={[['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']]}
        onChange={(animation) => onChange({ animation })}
      />
    </>
  );
}

function GamePanel({ s, deferredNote, onChange }: { s: Settings; deferredNote: boolean; onChange(patch: Partial<Settings>): void }) {
  return (
    <>
      <Segmented label="Draw" value={s.drawCount} options={[[1, 'Draw 1'], [3, 'Draw 3']]} onChange={(drawCount) => onChange({ drawCount })} />
      <Segmented
        label="Scoring"
        value={s.scoring}
        options={[['standard', 'Standard'], ['vegas', 'Vegas'], ['none', 'None']]}
        onChange={(scoring) => onChange({ scoring })}
      />
      {deferredNote && (
        <p className="note" role="status">Applies to your next game.</p>
      )}
      {s.scoring === 'vegas' && (
        <>
          <p className="note">Vegas limits passes through the stock (1 in Draw 1, 3 in Draw 3), so deals may not be winnable.</p>
          <Toggle label="Cumulative Vegas bank" checked={s.cumulativeVegas} onChange={(cumulativeVegas) => onChange({ cumulativeVegas })} />
        </>
      )}
      <Toggle
        label="Auto-move safe cards to foundations"
        hint="Off: nothing moves unless you move it. The finish still completes itself."
        checked={s.autoMove}
        onChange={(autoMove) => onChange({ autoMove })}
      />
      <Toggle label="Left-handed layout" checked={s.leftHanded} onChange={(leftHanded) => onChange({ leftHanded })} />
    </>
  );
}

function ControlsPanel({ s, onChange }: { s: Settings; onChange(patch: Partial<Settings>): void }) {
  return (
    <>
      <Toggle label="Sound" checked={s.sound} onChange={(sound) => onChange({ sound })} />
      <div>
        <div className="label">Keyboard shortcuts</div>
        <dl className="keys">
          <dt>Space / D</dt><dd>Draw</dd>
          <dt>Arrows</dt><dd>Move focus</dd>
          <dt>Enter</dt><dd>Pick up / drop</dd>
          <dt>Esc</dt><dd>Cancel</dd>
          <dt>Z / Shift+Z</dt><dd>Undo / redo</dd>
          <dt>H</dt><dd>Hint</dd>
          <dt>N</dt><dd>New game</dd>
        </dl>
      </div>
    </>
  );
}

export function SettingsDialog({ open, settings: s, deferredNote, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('appearance');
  // Every fresh open starts on Appearance (adjusting state during render avoids a frame of the old tab).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab('appearance');
  }
  const id = useId();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + step + TABS.length) % TABS.length;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const [key] = TABS[next];
    setTab(key);
    tabRefs.current[key]?.focus();
  };

  return (
    <Modal open={open} title="Settings" className="settings-modal" onClose={onClose} actions={<button type="button" className="primary" onClick={onClose}>Done</button>}>
      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(([key, name], i) => (
          <button
            type="button"
            key={key}
            role="tab"
            id={`${id}-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-panel`}
            tabIndex={tab === key ? 0 : -1}
            ref={(el) => {
              tabRefs.current[key] = el;
            }}
            className="tab"
            onClick={() => setTab(key)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'appearance' && <AppearancePanel s={s} onChange={onChange} />}
        {tab === 'game' && <GamePanel s={s} deferredNote={deferredNote} onChange={onChange} />}
        {tab === 'controls' && <ControlsPanel s={s} onChange={onChange} />}
      </div>
    </Modal>
  );
}

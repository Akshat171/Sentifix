import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing, Sequence } from 'remotion';
import { Stage } from '../components/Stage';
import { Panel } from '../components/Panel';
import { Chip } from '../components/Chip';
import { Rail } from '../components/Rail';
import { DiffView } from '../components/DiffView';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';
import { useCut, type TypeScale } from '../type';
import { RUN, DIFF_LINES, DIFF_STATS } from '../generated/run-data';

/** Beat boundaries in scene-local frames. Sum must equal the scene's length. */
const BEATS = [
  { node: 0, from: 0, to: 150 },
  { node: 1, from: 150, to: 330 },
  { node: 2, from: 330, to: 500 },
  { node: 3, from: 500, to: 560 },
  { node: 4, from: 560, to: 780 },
];

const HANDOFF = 16; // frames spent gliding from one node to the next

const Caption: React.FC<{ text: string; t: TypeScale; delay: number }> = ({ text, t, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - delay, config: ENTER_SPRING });
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: t.small,
        color: THEME.muted,
        opacity: s,
        letterSpacing: '.06em',
      }}
    >
      {text}
    </div>
  );
};

const FileRow: React.FC<{ path: string; delay: number; t: TypeScale; tone?: string }> = ({
  path,
  delay,
  t,
  tone,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - delay, config: ENTER_SPRING });
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: t.mono,
        color: tone ?? THEME.ink,
        padding: '7px 11px',
        background: tone ? THEME.accentWash : 'transparent',
        borderLeft: `2px solid ${tone ?? THEME.line}`,
        borderRadius: 4,
        opacity: s,
        transform: `translateX(${(1 - s) * -26}px)`,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {path}
    </div>
  );
};

/** Beat 1 — the classification, chip by chip. */
const Classify: React.FC<{ t: TypeScale; local: number }> = ({ t, local }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const summary = spring({ fps, frame: frame - 96, config: ENTER_SPRING });
  const c = RUN.classification;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, width: '100%' }}>
      <Panel label="incoming">
        <div style={{ fontSize: t.body, marginBottom: 8 }}>{RUN.issue.title}</div>
        <div style={{ fontFamily: MONO, fontSize: t.mono, color: THEME.sevCritical }}>
          {RUN.issue.error}
        </div>
        <div style={{ fontFamily: MONO, fontSize: t.small, color: THEME.muted, marginTop: 10 }}>
          via {RUN.issue.source} · {RUN.issue.repoFullName}
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Chip text={c.severity} delay={26} size={t.mono} tone={c.severity} />
        <Chip text={c.category} delay={44} size={t.mono} />
        {c.components.map((comp, i) => (
          <Chip key={comp} text={comp} delay={62 + i * 16} size={t.mono} />
        ))}
      </div>

      <div
        style={{
          fontSize: t.body,
          color: THEME.muted,
          lineHeight: 1.45,
          opacity: summary,
          transform: `translateY(${(1 - summary) * 12}px)`,
        }}
      >
        {c.summary}
      </div>
    </div>
  );
};

/**
 * Beat 2 — retrieval. Two rankings of the same real files collapse into one
 * fused order. The file paths are the run's real retrieved set; the per-column
 * orderings illustrate the mechanism (the candidate lists themselves are not
 * persisted, so no scores are shown).
 */
const Retrieve: React.FC<{ t: TypeScale; local: number }> = ({ t, local }) => {
  const files = RUN.diagnosis.relevantFiles;
  const bm25 = [files[2], files[0], files[1]];
  const fuse = interpolate(local, [86, 122], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, width: '100%' }}>
      <div style={{ display: 'flex', gap: t.gap }}>
        <Panel label="bm25" style={{ flex: 1, minWidth: 0, opacity: 1 - fuse * 0.75 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {bm25.map((p, i) => (
              <FileRow key={p} path={p} delay={12 + i * 9} t={t} />
            ))}
          </div>
        </Panel>
        <Panel label="vector · hyde" style={{ flex: 1, minWidth: 0, opacity: 1 - fuse * 0.75 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {files.map((p, i) => (
              <FileRow key={p} path={p} delay={30 + i * 9} t={t} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel label="rrf fused" accent style={{ opacity: fuse }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {files.map((p, i) => (
            <FileRow key={p} path={p} delay={92 + i * 10} t={t} tone={THEME.accentText} />
          ))}
        </div>
      </Panel>
      <Caption text="hybrid BM25 + vector · reciprocal rank fusion" t={t} delay={124} />
    </div>
  );
};

/** Beat 3 — the root cause, typed at a steady rate. */
const Diagnose: React.FC<{ t: TypeScale; local: number }> = ({ t, local }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = RUN.diagnosis.rootCause;
  // 1.5 chars/frame at 30fps = 45 chars/sec. Steady: no per-character jitter.
  const shown = Math.max(0, Math.min(text.length, Math.floor((local - 10) * 1.5)));
  const caret = local > 8 && shown < text.length;
  const detail = spring({ fps, frame: frame - 108, config: ENTER_SPRING });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, width: '100%' }}>
      <Panel label="root cause" accent>
        <div style={{ fontFamily: MONO, fontSize: t.h2 * 0.62, lineHeight: 1.5 }}>
          {text.slice(0, shown)}
          {caret ? <span style={{ color: THEME.accent }}>▋</span> : null}
        </div>
      </Panel>
      <div
        style={{
          fontSize: t.body,
          color: THEME.muted,
          lineHeight: 1.5,
          opacity: detail,
          transform: `translateY(${(1 - detail) * 14}px)`,
        }}
      >
        {RUN.diagnosis.detail}
      </div>
    </div>
  );
};

/** Beat 4 — the targeted second pass. Two seconds, then out. */
const Targeted: React.FC<{ t: TypeScale; local: number }> = ({ t, local }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, width: '100%' }}>
    <Panel label="second pass · diagnosis as query" accent>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {RUN.diagnosis.relevantFiles.map((p, i) => (
          <FileRow key={p} path={p} delay={6 + i * 8} t={t} tone={THEME.accentText} />
        ))}
      </div>
    </Panel>
    <Caption text="retrieves again, now knowing what it is looking for" t={t} delay={26} />
  </div>
);

/** Beat 5 — the real proposed diff, drawn line by line. */
const ProposeFix: React.FC<{ t: TypeScale; local: number }> = ({ t, local }) => {
  const { cut } = useCut();
  const size = cut === 'vertical' ? t.small : t.mono * 0.86;
  const visible = cut === 'vertical' ? 15 : 19;
  const revealed = Math.max(0, (local - 8) / 2.6);
  const scroll = Math.max(0, Math.min(DIFF_LINES.length - visible, revealed - visible + 2));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, width: '100%' }}>
      <Panel label="proposed fix" accent>
        <div
          style={{
            height: visible * size * 1.5,
            overflow: 'hidden',
            // Feather the scroll edges so a half-clipped line looks deliberate.
            maskImage:
              'linear-gradient(to bottom, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%)',
          }}
        >
          <DiffView revealed={revealed} fontSize={size} scrollLines={scroll} />
        </div>
      </Panel>
      <div style={{ fontFamily: MONO, fontSize: t.small, color: THEME.muted }}>
        {DIFF_STATS.files} files · <span style={{ color: THEME.add }}>+{DIFF_STATS.additions}</span>{' '}
        <span style={{ color: THEME.del }}>−{DIFF_STATS.deletions}</span>
      </div>
    </div>
  );
};

export const Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { t } = useCut();

  const beat = BEATS.find((b) => frame >= b.from && frame < b.to) ?? BEATS[BEATS.length - 1];
  const local = frame - beat.from;
  const progress = interpolate(local, [0, beat.to - beat.from], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ease the rail position across each boundary so the glide is one motion.
  const pos = interpolate(
    frame,
    BEATS.flatMap((b) => [b.from, b.from + HANDOFF]),
    BEATS.flatMap((b, i) => [i === 0 ? b.node : BEATS[i - 1].node, b.node]),
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) },
  );

  const Body = [Classify, Retrieve, Diagnose, Targeted, ProposeFix][beat.node];

  return (
    <Stage>
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap * 1.3, height: '100%' }}>
        <Rail pos={pos} progress={progress} />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Sequence
            from={beat.from}
            durationInFrames={beat.to - beat.from}
            layout="none"
            name={`beat:${beat.node}`}
          >
            <Body t={t} local={local} />
          </Sequence>
        </div>
      </div>
    </Stage>
  );
};

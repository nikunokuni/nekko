// ══════════════════════════════════════════════════════════════════
// KifuInsightScreen.jsx  ―  棋譜の傾向画面
//   ためた棋譜を集計して「よく出てくる／よく勝てる／よく負ける」戦型を出す。
//
//   ここは読み取り専用で、ツリーには一切手を加えない。
//   統計はすべてコードで計算し、断定的な助言は書かない
//   （数字を出すところまでが機械の仕事で、理由を書くのは利用者の仕事）。
// ══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { T } from "../theme";
import { SectionLabel } from "../components/uiParts";
import {
  fetchKifusForAnalysis, fetchKifusNeedingMeta, fetchKifusMissingSide,
  fetchKifuSnapshots, updateKifu, kifuRowToKifu,
} from "../db";
import { analyzeKifu, recomputeFeatures, resolveMySide, toAnalysisGame } from "../kifuAnalyze";
import { analyzeGames, analyzeSwingTiming } from "../kifuStats";
import { getKifuPlayerNames } from "../rewards";

// 最低局数の選択肢。少ないほど細かい傾向が出るが、偶然の偏りも拾いやすくなる
const MIN_GAMES_OPTIONS = [3, 5, 10];

const pct = (r) => `${Math.round(r * 100)}%`;

// ── 勝率バー ──────────────────────────────────────
// 実際の勝率を塗り、信頼区間を薄い帯で重ねる。
// 「2局2勝＝100%」がどれだけ当てにならないかが幅で見えるようにするため。
function RateBar({ rate, lower, upper }) {
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(26,15,0,0.08)", overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: `${lower * 100}%`, width: `${(upper - lower) * 100}%`,
        top: 0, bottom: 0, background: "rgba(160,120,64,0.25)",
      }} />
      <div style={{
        position: "absolute", left: 0, width: `${rate * 100}%`, top: 0, bottom: 0,
        background: T.gold, borderRadius: 4,
      }} />
    </div>
  );
}

// ── 1グループの行 ─────────────────────────────────
function GroupRow({ group, note }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `0.5px solid ${T.inkLineFaint}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
        <span style={{ flex: 1, fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif }}>
          {group.label}
        </span>
        <span style={{ fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif }}>
          {group.wins}勝{group.losses}敗{group.draws ? `${group.draws}分` : ""}
        </span>
        <span style={{ fontSize: T.fontSize.base, color: T.gold, fontFamily: T.fontSerif, minWidth: 38, textAlign: "right" }}>
          {pct(group.rate)}
        </span>
      </div>
      <RateBar rate={group.rate} lower={group.lower} upper={group.upper} />
      <div style={{ marginTop: 4, fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif }}>
        {group.games}局
        {group.castleCompleteness != null && ` ・ 囲いの完成度 ${pct(group.castleCompleteness)}`}
        {note && ` ・ ${note}`}
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <SectionLabel>{title}</SectionLabel>
      {description && (
        <div style={{ fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif, marginBottom: 4, lineHeight: 1.6 }}>
          {description}
        </div>
      )}
      {children}
    </div>
  );
}

const EMPTY = (text) => (
  <div style={{ padding: "12px 0", fontSize: T.fontSize.base, color: T.inkFaint, fontFamily: T.fontSerif }}>
    {text}
  </div>
);

// ══════════════════════════════════════════════════════════════════
export function KifuInsight({ userId, onBack, onGoSettings }) {
  const [kifus,    setKifus]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [minGames, setMinGames] = useState(5);
  const [sideFilter, setSideFilter] = useState("all"); // all | sente | gote
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");

  const playerNames = getKifuPlayerNames();

  const load = () => {
    if (!userId) return;
    setLoading(true);
    fetchKifusForAnalysis(userId).then(({ data }) => {
      setKifus((data || []).map(kifuRowToKifu));
      setLoading(false);
    });
  };
  useEffect(load, [userId]);

  // ── 取り込み済み棋譜の後追い解析 ──
  // 対局情報の列が増える前に取り込んだ棋譜も、source_text（原文）が残っているので
  // 読み直すだけで勝敗・戦型を埋められる。取り込みし直してもらう必要はない。
  const runBackfill = async () => {
    if (backfilling) return;
    setBackfilling(true);
    setBackfillMsg("");
    let done = 0, filled = 0;
    try {
      // 一度に全件は取らず、20件ずつ取っては書き戻す（原文と盤面は重いため）
      for (;;) {
        const { data, error } = await fetchKifusNeedingMeta(userId, 20);
        if (error || !data || data.length === 0) break;
        for (const row of data) {
          const a = analyzeKifu({
            sourceText: row.source_text,
            snapshots:  row.snapshots,
            playerNames,
          });
          await updateKifu(row.id, {
            senteName: a.senteName, goteName: a.goteName, handicap: a.handicap,
            result: a.result, mySide: a.mySide, playedAt: a.playedAt,
            features: a.features, metaParsed: true,
          });
          done++;
          if (a.features) filled++;
        }
        setBackfillMsg(`${done}件を解析しました…`);
      }
      setBackfillMsg(done === 0 ? "解析が必要な棋譜はありませんでした" : `${done}件を解析し、${filled}件が集計対象になりました`);
      load();
    } catch (e) {
      console.error("backfill error:", e);
      setBackfillMsg("解析中にエラーが起きました。もう一度お試しください");
    } finally {
      setBackfilling(false);
    }
  };

  // ── 対局者名を覚えたあと、過去の棋譜の先後をまとめて判定し直す ──
  // 名前の照合だけなら盤面は要らないので、まず軽い列だけで一致を調べ、
  // 一致したものだけ盤面を取りに行って特徴を計算する。
  const runResolveSides = async () => {
    if (backfilling) return;
    setBackfilling(true);
    setBackfillMsg("");
    let resolved = 0;
    try {
      const { data } = await fetchKifusMissingSide(userId);
      const targets = (data || [])
        .map((row) => ({ row, side: resolveMySide({ senteName: row.sente_name, goteName: row.gote_name }, playerNames) }))
        .filter((t) => t.side);
      for (const { row, side } of targets) {
        const { data: snap } = await fetchKifuSnapshots(row.id);
        await updateKifu(row.id, {
          mySide: side,
          features: recomputeFeatures({ snapshots: snap?.snapshots || [], mySide: side, handicap: row.handicap }),
        });
        resolved++;
        setBackfillMsg(`${resolved}件を判定しました…`);
      }
      setBackfillMsg(resolved === 0
        ? "登録済みの名前と一致する棋譜はありませんでした"
        : `${resolved}件の先後を判定しました`);
      load();
    } catch (e) {
      console.error("resolve sides error:", e);
      setBackfillMsg("判定中にエラーが起きました。もう一度お試しください");
    } finally {
      setBackfilling(false);
    }
  };

  // ── 集計 ──
  const { analysis, timing, excluded, needMeta } = useMemo(() => {
    const games = [];
    let noResult = 0, noSide = 0, handicapped = 0;
    let needMeta = 0;

    for (const k of kifus) {
      if (!k.metaParsed) { needMeta++; continue; }
      if (k.handicap && k.handicap !== "平手") { handicapped++; continue; }
      if (!k.result)  { noResult++; continue; }
      if (!k.mySide)  { noSide++;   continue; }
      const g = toAnalysisGame(k);
      if (g) games.push(g);
    }

    const filtered = sideFilter === "all" ? games : games.filter((g) => g.side === sideFilter);
    return {
      analysis: analyzeGames(filtered, { minGames }),
      timing:   analyzeSwingTiming(filtered),
      excluded: { noResult, noSide, handicapped },
      needMeta,
    };
  }, [kifus, minGames, sideFilter]);

  const { overall, frequent, strong, weak, total } = analysis;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: "1.125rem", color: T.ink, letterSpacing: "0.1em" }}>
          棋譜の傾向
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 40px" }}>
        {loading ? EMPTY("読み込み中…") : (
          <>
            {/* ── 自分の名前が未登録なら最初に案内する ── */}
            {playerNames.length === 0 && (
              <div style={{
                marginBottom: 16, padding: "12px 14px", borderRadius: T.radius.md,
                background: T.goldLight, fontSize: T.fontSize.base, color: T.ink,
                fontFamily: T.fontSerif, lineHeight: 1.7,
              }}>
                棋譜のどちらが自分かを判定できていません。設定で「棋譜での自分の名前」を登録すると、勝敗が自動で入ります。
                <div style={{ marginTop: 8 }}>
                  <button onClick={onGoSettings} style={{
                    padding: "6px 14px", borderRadius: T.radius.md, cursor: "pointer",
                    border: `0.5px solid ${T.gold}`, background: T.gold, color: T.cream,
                    fontFamily: T.fontSerif, fontSize: T.fontSize.base,
                  }}>設定を開く</button>
                </div>
              </div>
            )}

            {/* ── 未解析の棋譜がある場合の後追い解析 ── */}
            {needMeta > 0 && (
              <div style={{
                marginBottom: 16, padding: "12px 14px", borderRadius: T.radius.md,
                border: `0.5px solid ${T.inkLine}`, fontSize: T.fontSize.base,
                color: T.ink, fontFamily: T.fontSerif, lineHeight: 1.7,
              }}>
                対局情報が未解析の棋譜が{needMeta}件あります。取り込み直さなくても、保存してある原文から読み直せます。
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={runBackfill} disabled={backfilling} style={{
                    padding: "6px 14px", borderRadius: T.radius.md,
                    cursor: backfilling ? "default" : "pointer",
                    border: `0.5px solid ${T.gold}`,
                    background: backfilling ? T.goldLight : T.gold,
                    color: backfilling ? T.gold : T.cream,
                    fontFamily: T.fontSerif, fontSize: T.fontSize.base,
                  }}>{backfilling ? "解析中…" : "まとめて解析する"}</button>
                  {backfillMsg && <span style={{ fontSize: T.fontSize.sm, color: T.grayText }}>{backfillMsg}</span>}
                </div>
              </div>
            )}

            {/* ── 絞り込み ── */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: T.fontSize.sm, color: T.grayText, fontFamily: T.fontSerif }}>手番</span>
                {[["all", "両方"], ["sente", "先手"], ["gote", "後手"]].map(([v, label]) => (
                  <button key={v} onClick={() => setSideFilter(v)} style={{
                    padding: "3px 10px", borderRadius: T.radius.sm, cursor: "pointer",
                    fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
                    border: `0.5px solid ${sideFilter === v ? T.gold : T.inkLine}`,
                    background: sideFilter === v ? T.gold : "transparent",
                    color: sideFilter === v ? T.cream : T.grayText,
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: T.fontSize.sm, color: T.grayText, fontFamily: T.fontSerif }}>最低局数</span>
                {MIN_GAMES_OPTIONS.map((v) => (
                  <button key={v} onClick={() => setMinGames(v)} style={{
                    padding: "3px 10px", borderRadius: T.radius.sm, cursor: "pointer",
                    fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
                    border: `0.5px solid ${minGames === v ? T.gold : T.inkLine}`,
                    background: minGames === v ? T.gold : "transparent",
                    color: minGames === v ? T.cream : T.grayText,
                  }}>{v}局</button>
                ))}
              </div>
            </div>

            {/* ── 全体 ── */}
            <div style={{
              marginBottom: 22, padding: "14px 16px", borderRadius: T.radius.lg,
              background: T.goldBg, border: "0.5px solid rgba(200,169,110,0.35)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: T.fontTitle, fontSize: "1.5rem", color: T.ink }}>{pct(overall.rate)}</span>
                <span style={{ fontSize: T.fontSize.base, color: T.inkMid, fontFamily: T.fontSerif }}>
                  {total}局中 {overall.wins}勝{overall.losses}敗{overall.draws ? `${overall.draws}分` : ""}
                </span>
              </div>
              {(excluded.noResult + excluded.noSide + excluded.handicapped) > 0 && (
                <div style={{ marginTop: 8, fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.6 }}>
                  集計から外れた棋譜：
                  {excluded.noSide  > 0 && ` 自分の側が不明 ${excluded.noSide}件`}
                  {excluded.noResult > 0 && ` 勝敗が不明 ${excluded.noResult}件`}
                  {excluded.handicapped > 0 && ` 駒落ち ${excluded.handicapped}件`}
                </div>
              )}
              {/* 名前を新しく登録したあとに押すと、過去の棋譜の先後がまとめて埋まる */}
              {excluded.noSide > 0 && playerNames.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={runResolveSides} disabled={backfilling} style={{
                    padding: "5px 12px", borderRadius: T.radius.md,
                    cursor: backfilling ? "default" : "pointer",
                    border: `0.5px solid ${T.gold}`, background: "transparent", color: T.gold,
                    fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
                  }}>登録済みの名前で先後を判定し直す</button>
                </div>
              )}
            </div>

            {total < minGames * 2 && total > 0 && (
              <div style={{
                marginBottom: 18, fontSize: T.fontSize.sm, color: T.grayText,
                fontFamily: T.fontSerif, lineHeight: 1.7,
              }}>
                まだ棋譜が少ないため、傾向は参考程度です。50局あたりから戦型ごとの差がはっきりしてきます。
              </div>
            )}

            <Section
              title="よく出てくる"
              description="実際に多く指している戦型。研究する価値がもっとも高い順番でもあります。"
            >
              {frequent.length === 0
                ? EMPTY(total === 0 ? "集計できる棋譜がまだありません" : `${minGames}局以上ためた戦型がまだありません`)
                : frequent.map((g) => <GroupRow key={g.key} group={g} note={g.level} />)}
            </Section>

            <Section
              title="よく勝てる"
              description="全体の勝率より確実に高い戦型だけを出しています（少ない局数のまぐれを除くため、勝率ではなく信頼区間で判定）。"
            >
              {strong.length === 0
                ? EMPTY("全体より確実に勝てていると言える戦型は、まだありません")
                : strong.map((g) => <GroupRow key={g.key} group={g} note={g.level} />)}
            </Section>

            <Section
              title="よく負ける"
              description="全体の勝率より確実に低い戦型を、取りこぼしている局数の多い順に並べています。上から直すのが効率的です。"
            >
              {weak.length === 0
                ? EMPTY("全体より確実に負けていると言える戦型は、まだありません")
                : weak.map((g) => (
                    <GroupRow key={g.key} group={g} note={`${g.level}・約${g.lostGames.toFixed(1)}局分の取りこぼし`} />
                  ))}
            </Section>

            {(timing["先発"] || timing["対応"]) && (
              <Section
                title="自分から決める / 相手に合わせる"
                description="飛車を振った順番から、自分から戦型を決めた対局と、相手の戦型を見てから合わせた対局を比べています。"
              >
                {["先発", "対応"].map((k) => timing[k] && (
                  <GroupRow
                    key={k}
                    group={{ ...timing[k], key: k, label: k === "先発" ? "自分から決めた" : "相手を見てから決めた" }}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

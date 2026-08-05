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
  fetchKifuSnapshotsMany, updateKifu, kifuRowToKifu, ANALYSIS_GAME_LIMIT,
} from "../db";
import { analyzeKifu, recomputeFeatures, resolveMySide, toAnalysisGame } from "../kifuAnalyze";
import { analyzeGames, analyzeSwingTiming, groupBy, BRANCH_VIEWS } from "../kifuStats";
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

// ── 戦型べつ一覧の1行 ─────────────────────────────
// 数局しかない段階で勝率バーを出すと、偶然の偏りを傾向のように見せてしまう。
// ここでは勝敗をそのまま並べるだけにとどめる。
function MatchupRow({ group }) {
  const castle = group.castleCompleteness;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      padding: "9px 0", borderBottom: `0.5px solid ${T.inkLineFaint}`,
    }}>
      <span style={{ flex: 1, fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif }}>
        {group.label}
      </span>
      {castle != null && castle < 1 && (
        <span style={{ fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif }}>
          囲いが組みかけ
        </span>
      )}
      <span style={{ fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif }}>
        {group.wins}勝{group.losses}敗{group.draws ? `${group.draws}分` : ""}
      </span>
      <span style={{ fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif, minWidth: 30, textAlign: "right" }}>
        {group.games}局
      </span>
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
  const [minGames, setMinGames] = useState(3);
  const [sideFilter, setSideFilter] = useState("all"); // all | sente | gote
  // 分岐を探すための観点。選ぶと下の一覧がその軸で組み直される
  const [viewKey, setViewKey] = useState(BRANCH_VIEWS[0].key);
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

  // ── 棋譜の解析（未解析の解析 ＋ 先後の再判定を1つにまとめたもの）──
  // 利用者からは「解析されていない棋譜がある」という1つの状態にしか見えないので、
  // ボタンも1つにする。中では次の2段階を順に行う。
  //   ① meta_parsed=false … 原文（source_text）から対局者名・勝敗・戦型を読む
  //   ② my_side=null      … 登録済みの対局者名と照合して先後を決め、戦型を計算する
  // ②があるので、棋譜を取り込んだ「あとから」名前を登録しても後追いで埋められる。
  const runAnalysis = async () => {
    if (backfilling) return;
    setBackfilling(true);
    setBackfillMsg("");
    let parsed = 0, sided = 0;
    try {
      // ① 未解析の棋譜を原文から解析する。
      //    原文と盤面は重いので20件ずつ取っては書き戻す。
      for (;;) {
        const { data, error } = await fetchKifusNeedingMeta(userId, 20);
        if (error || !data || data.length === 0) break;
        let progressed = false;
        for (const row of data) {
          const a = analyzeKifu({
            sourceText: row.source_text,
            snapshots:  row.snapshots,
            playerNames,
          });
          const { error: upErr } = await updateKifu(row.id, {
            senteName: a.senteName, goteName: a.goteName, handicap: a.handicap,
            result: a.result, mySide: a.mySide, playedAt: a.playedAt,
            features: a.features, metaParsed: true,
          });
          if (upErr) continue;
          progressed = true;
          parsed++;
        }
        setBackfillMsg(`${parsed}件を解析しました…`);
        // 1件も書き戻せなかったら同じ行を取り続けるので打ち切る（無限ループ防止）
        if (!progressed) break;
      }

      // ② 先後が決まっていない棋譜を、登録済みの名前で判定し直す。
      //    名前の照合に盤面は要らないので、まず軽い列だけで一致を調べ、
      //    一致したものだけ盤面を取りに行って戦型を計算する。
      if (playerNames.length > 0) {
        const { data } = await fetchKifusMissingSide(userId);
        const targets = (data || [])
          .map((row) => ({ row, side: resolveMySide({ senteName: row.sente_name, goteName: row.gote_name }, playerNames) }))
          .filter((t) => t.side);
        // 盤面はまとめて取る。1件ずつ取ると、対象が100局あれば100往復ぶん待たされる
        const snapshotsById = await fetchKifuSnapshotsMany(targets.map((t) => t.row.id));
        for (const { row, side } of targets) {
          const { error: upErr } = await updateKifu(row.id, {
            mySide: side,
            features: recomputeFeatures({ snapshots: snapshotsById.get(row.id) || [], mySide: side, handicap: row.handicap }),
          });
          if (upErr) continue;
          sided++;
          setBackfillMsg(`${sided}件の先後を判定しました…`);
        }
      }

      const parts = [];
      if (parsed) parts.push(`${parsed}件を解析`);
      if (sided)  parts.push(`${sided}件の先後を判定`);
      setBackfillMsg(parts.length === 0
        ? (playerNames.length === 0
            ? "先に設定で「棋譜での自分の名前」を登録してください"
            : "登録済みの名前と一致する棋譜がありませんでした")
        : `${parts.join("・")}しました`);
      load();
    } catch (e) {
      console.error("runAnalysis error:", e);
      setBackfillMsg("解析中にエラーが起きました。もう一度お試しください");
    } finally {
      setBackfilling(false);
    }
  };

  // ── 集計 ──
  const view = BRANCH_VIEWS.find((v) => v.key === viewKey) || BRANCH_VIEWS[0];
  const { analysis, timing, byView, excluded, needMeta } = useMemo(() => {
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
      // 足切りなしの一覧。統計として有意かどうかとは別に、
      // 「どの分かれ方で何局あったか」は1局からでも読む価値があるため常に出す。
      byView: groupBy(filtered, view.dims).sort((a, b) => b.games - a.games),
      excluded: { noResult, noSide, handicapped },
      needMeta,
    };
  }, [kifus, minGames, sideFilter, view]);

  const { overall, strong, weak, total } = analysis;

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

            {/* ── 解析が必要な棋譜がある場合 ──
                「原文が未解析」も「先後が未確定」も、利用者から見れば
                 同じ『まだ集計に載っていない』状態なので、1つの案内にまとめる */}
            {(needMeta > 0 || excluded.noSide > 0) && (
              <div style={{
                marginBottom: 16, padding: "12px 14px", borderRadius: T.radius.md,
                border: `0.5px solid ${T.inkLine}`, fontSize: T.fontSize.base,
                color: T.ink, fontFamily: T.fontSerif, lineHeight: 1.7,
              }}>
                {needMeta > 0 && <div>対局情報が未解析の棋譜が{needMeta}件あります。取り込み直さなくても、保存してある原文から読み直せます。</div>}
                {excluded.noSide > 0 && <div>あなたがどちら側か決まっていない棋譜が{excluded.noSide}件あります。登録済みの名前と照らし合わせて判定できます。</div>}
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={runAnalysis} disabled={backfilling} style={{
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
              {/* 上限に達したら黙って古い棋譜を捨てない。
                  「全部の棋譜の傾向」と思って読むと、数字の意味が変わってしまうため */}
              {kifus.length >= ANALYSIS_GAME_LIMIT && (
                <div style={{ marginTop: 8, fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.6 }}>
                  直近{ANALYSIS_GAME_LIMIT}局を対象にしています（それより前の棋譜は今の指し方と離れるため）
                </div>
              )}
            </div>

            {total < minGames * 2 && total > 0 && (
              <div style={{
                marginBottom: 18, fontSize: T.fontSize.sm, color: T.grayText,
                fontFamily: T.fontSerif, lineHeight: 1.7,
              }}>
                「よく勝てる／よく負ける」は、まぐれと本当の傾向を区別できる局数がたまってから出ます。
                それまでは上の「戦型べつの成績」を見てください。
              </div>
            )}

            <Section
              title="分岐を探す"
              description="どの観点で分けるかを選ぶと、その分かれ方で並べ替わります。差が出ている観点が、そのまま分岐を作る場所の候補になります。"
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {BRANCH_VIEWS.map((v) => (
                  <button key={v.key} onClick={() => setViewKey(v.key)} style={{
                    padding: "4px 11px", borderRadius: T.radius.sm, cursor: "pointer",
                    fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
                    border: `0.5px solid ${viewKey === v.key ? T.gold : T.inkLine}`,
                    background: viewKey === v.key ? T.gold : "transparent",
                    color: viewKey === v.key ? T.cream : T.grayText,
                  }}>{v.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                <i className="ti ti-bulb" style={{ marginTop: 3, flexShrink: 0 }} />
                <span>{view.hint}</span>
              </div>
              {byView.length === 0
                ? EMPTY("集計できる棋譜がまだありません")
                : byView.map((g) => <MatchupRow key={g.key} group={g} />)}
              {byView.length === 1 && (
                <div style={{ marginTop: 6, fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                  この観点では分かれていません。別の観点を選ぶと分かれ目が見つかるかもしれません。
                </div>
              )}
            </Section>

            <Section
              title="よく勝てる"
              description="全体の勝率より確実に高い戦型だけを出しています（少ない局数のまぐれを除くため、勝率ではなく信頼区間で判定）。"
            >
              {strong.length === 0
                ? EMPTY(`${minGames}局以上ためた戦型のうち、全体より確実に勝てていると言えるものはまだありません`)
                : strong.map((g) => <GroupRow key={g.key} group={g} note={g.level} />)}
            </Section>

            <Section
              title="よく負ける"
              description="全体の勝率より確実に低い戦型を、取りこぼしている局数の多い順に並べています。上から直すのが効率的です。"
            >
              {weak.length === 0
                ? EMPTY(`${minGames}局以上ためた戦型のうち、全体より確実に負けていると言えるものはまだありません`)
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

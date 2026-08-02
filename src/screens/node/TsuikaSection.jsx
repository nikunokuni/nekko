// ══════════════════════════════════════════════════════════════════
// TsuikaSection.jsx  ―  ノード詳細画面の「ついか」セクション
//   志向 / 序盤の意識 / 頻度・勝率・好き度 / 研究メモ（狙い・注意・宿題）
//
//   各項目は設定でON/OFFできる（show）。全部OFFならセクションごと出さない。
//
//   保存の作法は2種類ある：
//     onPick(key, value) … 選択式（志向・各レーティング）。タップで即保存する
//     onEdit(key, value) … 入力式（テキスト）。打っている間はデバウンス保存
//     onEditEnd()        … 入力欄から離れたときに未送信ぶんを送り切る
// ══════════════════════════════════════════════════════════════════
import { T, TEXTAREA_STYLE, focusBorder, blurBorder } from "../../theme";
import { SectionLabel, IconRating } from "../../components/uiParts";
import { SectionHeader, SectionDivider } from "./sectionParts";
import {
  ORIENTATION_META, USAGE_LEVELS, USAGE_META, WIN_RATE_LEVELS, LIKE_LEVELS,
} from "../../data";

const ORIENTATIONS = ["攻め", "受け", "バランス", "不明"];

// 研究メモの3欄。ラベルと保存キーの対応をここ1箇所で持つ
const STUDY_FIELDS = [
  { key: "aim",       label: "ここでの狙い",   placeholder: "じっくり研究するときに：この局面で目指すこと" },
  { key: "caution",   label: "気を付けること", placeholder: "じっくり研究するときに：ミスしやすい点・落とし穴" },
  { key: "nextStudy", label: "次に調べること", placeholder: "次の研究への宿題・深掘りしたい手順" },
];

export function TsuikaSection({
  show, values, open, onToggleOpen, memoOpen, onToggleMemo,
  onPick, onEdit, onEditEnd,
}) {
  const anyVisible = Object.values(show).some(Boolean);
  if (!anyVisible) return null;

  const { orientation, openingFocus, usageLevel, winRate, likeLevel } = values;

  return (
    <>
      <div onClick={onToggleOpen} style={{ cursor: "pointer" }}>
        <SectionHeader icon="ti-adjustments" dataOnboard="tsuika">
          ついか
          <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid, marginLeft: "auto" }} />
        </SectionHeader>
      </div>

      {open && (
        <>
          {/* 志向（攻め / 受け / バランス / 不明）*/}
          {show.orientation && (
            <div style={{ padding: "0 16px 10px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>志向</SectionLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {ORIENTATIONS.map((o) => {
                  const selected = orientation === o;
                  const meta = ORIENTATION_META[o] || {};
                  return (
                    <div
                      key={o}
                      onClick={() => onPick("orientation", o)}
                      style={{
                        flex:         1,
                        textAlign:    "center",
                        padding:      "8px 4px",
                        borderRadius: T.radius.md,
                        cursor:       "pointer",
                        fontSize:     T.fontSize.base,
                        fontFamily:   T.fontSerif,
                        transition:   "all 0.15s",
                        border:       selected ? `1.5px solid ${meta.color || T.gold}` : `0.5px solid ${T.inkLine}`,
                        background:   selected ? (meta.bg || T.goldLight) : T.cream,
                        color:        selected ? (meta.color || T.gold)   : T.inkMid,
                        fontWeight:   selected ? 600 : 400,
                      }}
                    >
                      {o}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 序盤の意識（この局面へ持っていくために序盤で意識すべきこと）*/}
          {show.openingFocus && (
            <div style={{ padding: "0 16px 10px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>
                <i className="ti ti-flag" style={{ fontSize: "0.75rem", color: T.gold, marginRight: 4 }} />
                序盤の意識
              </SectionLabel>
              <textarea
                value={openingFocus}
                onChange={(e) => onEdit("openingFocus", e.target.value)}
                onBlur={(e) => { blurBorder(e); onEditEnd(); }}
                onFocus={focusBorder}
                placeholder="この局面に持っていくために、序盤で意識すべきこと"
                rows={2}
                style={TEXTAREA_STYLE}
              />
            </div>
          )}

          {/* 頻度（炎）／勝率（トロフィー）／好き度（ハート）
              同じ形のラジオが3段並ぶと軸の違いが分かりにくいため、
              軸ごとにアイコンの形と色を変えて視覚で区別する */}
          {show.usage && (
            <div style={{ padding: "0 16px 10px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>
                <i className="ti ti-flame" style={{ fontSize: "0.75rem", color: T.gold, marginRight: 4 }} />
                頻度（どのくらい指すか）
              </SectionLabel>
              <IconRating
                icon="ti-flame" color={T.gold} bg={T.goldLight}
                levels={USAGE_LEVELS} value={usageLevel}
                onChange={(lvl) => onPick("usageLevel", lvl)}
                lowLabel={USAGE_META[USAGE_LEVELS[0]].label}
                highLabel={USAGE_META[USAGE_LEVELS[USAGE_LEVELS.length - 1]].label}
                valueLabel={USAGE_META[usageLevel]?.label ?? "未設定"}
              />
            </div>
          )}

          {show.winRate && (
            <div style={{ padding: "0 16px 10px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>
                <i className="ti ti-trophy" style={{ fontSize: "0.75rem", color: T.green, marginRight: 4 }} />
                勝率（どのくらい勝てるか）
              </SectionLabel>
              <IconRating
                icon="ti-trophy" color={T.green} bg={T.greenBg}
                levels={WIN_RATE_LEVELS} value={winRate} clearable
                onChange={(lvl) => onPick("winRate", lvl)}
                lowLabel="勝てない" highLabel="勝ちやすい"
                valueLabel={winRate != null ? `${winRate}割くらい勝てる` : "未設定"}
              />
            </div>
          )}

          {show.likeLevel && (
            <div style={{ padding: "0 16px 10px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>
                <i className="ti ti-heart" style={{ fontSize: "0.75rem", color: T.red, marginRight: 4 }} />
                好き度（どのくらい好きか）
              </SectionLabel>
              <IconRating
                icon="ti-heart" color={T.red} bg={T.redBg}
                levels={LIKE_LEVELS.map((l) => l.value)} value={likeLevel} clearable
                onChange={(lvl) => onPick("likeLevel", lvl)}
                lowLabel={LIKE_LEVELS[0].label}
                highLabel={LIKE_LEVELS[LIKE_LEVELS.length - 1].label}
                valueLabel={LIKE_LEVELS.find((l) => l.value === likeLevel)?.label ?? "未設定"}
              />
            </div>
          )}

          {/* ════ 研究メモ（折りたたみ） ════
              一言コメントはメモ直下（きほん）へ移動済み。ここは研究時に書く3欄のみ */}
          {show.studyMemo && (
            <>
              <div
                onClick={onToggleMemo}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px 6px", cursor: "pointer" }}
              >
                <SectionLabel style={{ marginBottom: 0 }}>研究メモ（狙い・注意・宿題）</SectionLabel>
                <i className={`ti ti-chevron-${memoOpen ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid }} />
              </div>

              {memoOpen && STUDY_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} style={{ padding: "0 16px 10px" }}>
                  <SectionLabel style={{ marginBottom: 5 }}>{label}</SectionLabel>
                  <textarea
                    value={values[key]}
                    onChange={(e) => onEdit(key, e.target.value)}
                    onBlur={(e) => { blurBorder(e); onEditEnd(); }}
                    onFocus={focusBorder}
                    placeholder={placeholder}
                    rows={2}
                    style={TEXTAREA_STYLE}
                  />
                </div>
              ))}
            </>
          )}
        </>
      )}

      <SectionDivider />
    </>
  );
}

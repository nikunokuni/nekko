// ══════════════════════════════════════════════════════════════════
// mapLayout.js  ―  マインドマップの座標計算（純粋関数）
//
//   ツリー（ノードの親子）→ SVGに描くための座標・エッジ・幹。
//   画面（MindMapScreen.jsx）から切り出してあるのは、ここが図の正しさの
//   芯だからで、JSXの中に置くと Node から直接叩けずテストが書けない。
//   とくに「子は必ず親より下に来る」は、崩れると矢印が上を向くのに
//   画面は落ちない（＝目で見つけるしかない）ので、テストで押さえておく。
//
//   実行結果は座標だけで、DOM も React も触らない。
// ══════════════════════════════════════════════════════════════════
import { ORIENTATION_META } from "./data.js";
import { isTrunkParent, orderedChildIds, branchRanks, branchSides } from "./treeOps.js";

/** ノードの矩形サイズ */
export const NODE_W = 110;
export const NODE_H = 38;

/** 棋譜の分岐1つぶんの縦のずれ。
    「第20手からの分岐は第3手からの分岐より下」を絵で示すための間隔で、
    ノードの衝突を避けるためのものではない（横方向は xCounter が既に分けている）。
    左右へ振り分けてあるぶん、これだけ詰めても目盛りと枝の対応を追える */
export const BRANCH_STEP = 22;

/** 幹の1つめの目盛りを、親ノードの下辺からどれだけ離すか。
    0 にすると、1つめの目盛りの数字（「第3手」）が親ノードの枠に重なって読めない */
export const TRUNK_HEAD = 11;

/** 畳み状態が空のときに使い回す集合（毎レンダリングで新しい Set を作らない） */
export const NO_HIDDEN = new Set();

/** 志向ごとのエッジ色（攻め=赤 / 受け=青 / バランス=緑 / 不明=グレー） */
const ORIENTATION_LINE_COLOR = {
  "攻め":     ORIENTATION_META["攻め"].color,
  "受け":     ORIENTATION_META["受け"].color,
  "バランス": ORIENTATION_META["バランス"].color,
  "不明":     ORIENTATION_META["不明"].color,
};

/**
 * ツリー構造からSVG描画用の座標・エッジ情報を計算する
 *
 * ロジック:
 *   - 葉ノードを左から順番に配置（xCounter）
 *   - 親ノードは子ノード群の中央に配置
 *   - エッジは親の下端→子の上端へのベジェ曲線
 *
 * @param {Object} nodes  - ノードID→ノードオブジェクトのマップ
 * @param {string} rootId - ルートノードのID
 * @returns {{ positions: Object, edges: Array }}
 */
// 「とりあえず」（置き場）は本体の枝の並びから外し、
// ツリー全体の下に離して置く。置き場が枝の途中に混ざると、
// 整理済みの分岐と見分けがつかなくなるため。
export function findInboxId(nodes, rootId) {
  const root = nodes[rootId];
  if (!root) return null;
  return (root.childIds || []).find((cid) => nodes[cid]?.isInbox) ?? null;
}

export function layoutTree(nodes, rootId, inboxId = null, hiddenIds = NO_HIDDEN) {
  const positions = {};
  const edges     = [];
  const trunks    = [];   // 棋譜の分岐が並ぶ「幹」（線として描く。ノードの矩形は変えない）
  let xCounter    = 0;
  // 「とりあえず」の枝を本体のレイアウトから外すための基準。
  // 本体を組んでから、その下に別の島として置き直す。
  let yBase = 0;

  /** 行の縦位置。深さに加えて「棋譜の何手目から分岐したか」の順位ぶんだけ下げる。
      accRank は親から受け継いで累積させる。累積しないと、深さ+1 のぶん（78px）と
      親の順位のぶんが打ち消し合って子が親と同じ高さに来てしまい、
      条件次第で矢印が上を向く */
  const rowY = (depth, accRank) => yBase + depth * (NODE_H + 40) + accRank * BRANCH_STEP;

  /** 描く対象の子（置き場は本体に混ぜない／畳んだ束の中身は出さない）。
      並び順は treeOps に一本化してある（詳細画面の子一覧と同じ順にするため） */
  const visibleChildren = (id) =>
    orderedChildIds(nodes, id).filter((cid) => cid !== inboxId && !hiddenIds.has(cid));

  /** 再帰的に各ノードの x/y 座標を割り当てる */
  function assignPositions(id, depth, accRank) {
    const node = nodes[id];
    if (!node) return;

    const children = visibleChildren(id);

    if (children.length === 0) {
      // 葉ノード: 左から順に配置
      positions[id] = { x: xCounter * (NODE_W + 16), y: rowY(depth, accRank) };
      xCounter++;
      return;
    }

    const ranks = branchRanks(nodes, id);

    if (isTrunkParent(nodes, id)) {
      // 幹モード：子を幹の左右へ振り分け、親は幹の列に立つ（子の中央には寄せない）。
      // 隣り合う手数の枝が必ず反対側へ離れるので、縦の間隔を詰めても
      // 「どの目盛りから出た枝か」を追える
      const sides = branchSides(nodes, id);
      const left  = children.filter((cid) => sides.get(cid) === "L");
      const right = children.filter((cid) => sides.get(cid) === "R");
      // 左は手数の逆順に置く。こうすると左右どちらも「幹に近いほど早い手数」で揃う
      [...left].reverse().forEach((cid) => assignPositions(cid, depth + 1, accRank + (ranks.get(cid) || 0)));
      const trunkSlot = xCounter++;   // 幹のために1列空ける
      right.forEach((cid) => assignPositions(cid, depth + 1, accRank + (ranks.get(cid) || 0)));
      positions[id] = { x: trunkSlot * (NODE_W + 16), y: rowY(depth, accRank) };
      return;
    }

    // 中間ノード: 子を先に配置してから中央に合わせる
    const startX = xCounter;
    children.forEach((cid) => assignPositions(cid, depth + 1, accRank));
    const endX  = xCounter - 1;
    const midX  = ((startX + endX) / 2) * (NODE_W + 16);
    positions[id] = { x: midX, y: rowY(depth, accRank) };
  }

  /** 再帰的にエッジ情報を構築する（座標は確定済みなので accRank は不要） */
  function buildEdges(id) {
    const node    = nodes[id];
    const fromPos = positions[id];
    if (!node || !fromPos) return;

    const children = visibleChildren(id);
    if (children.length === 0) return;

    const trunk = isTrunkParent(nodes, id);
    const ranks = trunk ? branchRanks(nodes, id) : null;
    const sides = trunk ? branchSides(nodes, id) : null;
    const ticks = [];

    children.forEach((cid) => {
      const child = nodes[cid];
      const toPos = positions[cid];
      if (!child || !toPos) return;

      // 幹モードでは、枝は親の下辺中央ではなく幹の目盛りから出る
      const y1 = trunk
        ? fromPos.y + NODE_H + TRUNK_HEAD + (ranks.get(cid) || 0) * BRANCH_STEP
        : fromPos.y + NODE_H;

      edges.push({
        from:    id,
        to:      cid,
        x1:      fromPos.x + NODE_W / 2,  // 親ノードの下辺中央（＝幹の位置）
        y1,
        x2:      toPos.x   + NODE_W / 2,  // 子ノードの上辺中央
        y2:      toPos.y,
        color:   ORIENTATION_LINE_COLOR[child.orientation] || ORIENTATION_LINE_COLOR["不明"],
        dashed:  !child.orientation || child.orientation === "不明",
        isMerge: false,
      });

      // 目盛りは「その枝が出る側」へ突き出す。片側だけに出すと、
      // 第12手の目盛りから出たのが左の枝か右の枝か分からなくなる
      if (trunk && child.branchFromMoveIndex != null) {
        ticks.push({
          y:     y1,
          dir:   sides.get(cid) === "L" ? -1 : 1,
          label: child.branchFromMoveIndex === 0 ? "初期局面" : `第${child.branchFromMoveIndex}手`,
        });
      }

      buildEdges(cid);
    });

    if (trunk && ticks.length > 0) {
      trunks.push({
        x:     fromPos.x + NODE_W / 2,
        y0:    fromPos.y + NODE_H,
        y1:    Math.max(...ticks.map((t) => t.y)),
        ticks,
      });
    }
  }

  assignPositions(rootId, 0, 0);
  buildEdges(rootId);

  // ── 「とりあえず」の島を本体の下に置く ──
  // 親（ルート）との線は引かない。ツリーの上から下まで貫く長い線になって
  // 本体の枝と交差し、かえって読みにくくなるため。位置で所属を示す。
  if (inboxId && nodes[inboxId]) {
    const ys = Object.values(positions).map((p) => p.y);
    yBase = (ys.length ? Math.max(...ys) : 0) + NODE_H + 72;
    xCounter = 0;
    assignPositions(inboxId, 0, 0);
    buildEdges(inboxId);
  }

  return { positions, edges, trunks };
}


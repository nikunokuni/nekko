// ══════════════════════════════════════════════════════════════════
// MindMapScreen.jsx  ―  SVGマインドマップ
//   （ドラッグ操作・目次ドロワー付き）
// ══════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Accordion } from "../components";
import { STATUS_META, USAGE_META, ORIENTATION_META } from "../data";
import { T } from "../theme";

/** ノードの矩形サイズ */
const NODE_W = 110;
const NODE_H = 38;

/** ステータス別のノード枠線・テキスト色 */
const STATUS_NODE = {
  done: { stroke: T.green,  text: "#27500A" },
  wip:  { stroke: T.redDark, text: T.redDark },
  todo: { stroke: T.gray,   text: T.grayText, dashed: true },
};

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
function layoutTree(nodes, rootId) {
  const positions = {};
  const edges     = [];
  let xCounter    = 0;

  /** 再帰的に各ノードの x/y 座標を割り当てる */
  function assignPositions(id, depth) {
    const node = nodes[id];
    if (!node) return;

    const children = (node.childIds || []).filter((cid) => nodes[cid]);

    if (children.length === 0) {
      // 葉ノード: 左から順に配置
      positions[id] = { x: xCounter * (NODE_W + 16), y: depth * (NODE_H + 40) };
      xCounter++;
      return;
    }

    // 中間ノード: 子を先に配置してから中央に合わせる
    const startX = xCounter;
    children.forEach((cid) => assignPositions(cid, depth + 1));
    const endX  = xCounter - 1;
    const midX  = ((startX + endX) / 2) * (NODE_W + 16);
    positions[id] = { x: midX, y: depth * (NODE_H + 40) };
  }

  /** 再帰的にエッジ情報を構築する */
  function buildEdges(id) {
    const node = nodes[id];
    if (!node) return;

    (node.childIds || []).forEach((cid) => {
      const child   = nodes[cid];
      const fromPos = positions[id];
      const toPos   = positions[cid];
      if (!child || !fromPos || !toPos) return;

      edges.push({
        from:    id,
        to:      cid,
        x1:      fromPos.x + NODE_W / 2,  // 親ノードの下辺中央
        y1:      fromPos.y + NODE_H,
        x2:      toPos.x   + NODE_W / 2,  // 子ノードの上辺中央
        y2:      toPos.y,
        color:   ORIENTATION_LINE_COLOR[child.orientation] || ORIENTATION_LINE_COLOR["不明"],
        dashed:  !child.orientation || child.orientation === "不明",
        isMerge: false,
      });

      buildEdges(cid);
    });
  }

  assignPositions(rootId, 0);
  buildEdges(rootId);

  return { positions, edges };
}

export function MindMap({ tree, onNodeSelect, onBack, onReparent, canUndoReparent, onUndoReparent, onMemoSave }) {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [memoValue,    setMemoValue]    = useState(tree?.quickMemo || "");
  const [canvasOffset, setCanvasOffset] = useState({ x: 20, y: 20 });
  const [dragging,     setDragging]     = useState(false);
  const [scale,        setScale]        = useState(1);
  const [nodeDrag,     setNodeDrag]     = useState(null); // 親付け替え中のノードID
  const [dropTarget,   setDropTarget]   = useState(null); // ドロップ先候補ノードID
  const dragStart    = useRef(null);
  const pinchStart   = useRef(null);
  const mapRef       = useRef(null);
  const nodeDragRef  = useRef(null);  // window リスナーから最新値を読むため
  const dropTargetRef = useRef(null);

  const MIN_SCALE = 0.4;
  const MAX_SCALE = 2.5;
  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  /** 2点間の距離を返す（ピンチ判定用） */
  const touchDist = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

  const { nodes } = tree;
  const rootId    = tree.rootId ?? Object.values(nodes).find((n) => n.isRoot)?.id ?? null;

  // ── ノード数に応じてルート上に表示する成長アイコン ──
  const totalNodeCount = Object.keys(nodes).length;
  const growthIcon =
    totalNodeCount <= 3  ? "🌰" :
    totalNodeCount <= 10 ? "🌱" :
    totalNodeCount <= 20 ? "🌼" :
    "🌳";
  // 大きくなりすぎるとルート周辺を覆ってしまうため上限を設ける
  const growthIconSize = Math.min(90, totalNodeCount * 3);

  const { positions, edges } = useMemo(
    () => rootId ? layoutTree(nodes, rootId) : { positions: {}, edges: [] },
    [nodes, rootId]
  );

  // 合流エッジ（追加の親 → 子）。紫の点線で、ノードを避けて描画する
  const mergeEdges = useMemo(() => {
    const out = [];
    Object.values(nodes).forEach((n) => {
      (n.mergeParentIds || []).forEach((pid) => {
        const from = positions[pid];
        const to   = positions[n.id];
        if (from && to) out.push({ from, to });
      });
    });
    return out;
  }, [nodes, positions]);

  // ── ノードドラッグで親付け替え ─────────────────
  /** あるノードの子孫ID集合（循環防止） */
  const descendantsOf = (id) => {
    const out = new Set();
    const walk = (i) => (nodes[i]?.childIds || []).forEach((c) => { out.add(c); walk(c); });
    walk(id);
    return out;
  };

  /** 画面座標 → キャンバス座標へ変換 */
  const screenToCanvas = (clientX, clientY) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - canvasOffset.x) / scale,
      y: (clientY - rect.top  - canvasOffset.y) / scale,
    };
  };

  /** キャンバス座標にあるノードを返す（除外集合・自身を除く） */
  // 描画時と同じく頻度(usageScale)による拡大を考慮して当たり判定の矩形を求める
  const nodeAtPoint = (cx, cy, excludeSet, selfId) => {
    for (const [id, pos] of Object.entries(positions)) {
      if (id === selfId || excludeSet.has(id)) continue;
      const usageScale = id === rootId ? 1 : (USAGE_META[nodes[id]?.usageLevel]?.scale ?? 1);
      const w = NODE_W * usageScale, h = NODE_H * usageScale;
      const rx = pos.x - (w - NODE_W) / 2, ry = pos.y - (h - NODE_H) / 2;
      if (cx >= rx && cx <= rx + w && cy >= ry && cy <= ry + h) return id;
    }
    return null;
  };

  const startNodeDrag = (id, clientX, clientY) => {
    const noMove = id === rootId; // ルートは付け替え不可（クリック選択のみ）
    const dd = { id, exclude: noMove ? new Set() : descendantsOf(id), startX: clientX, startY: clientY, moved: false, noMove };
    nodeDragRef.current = dd;
    setNodeDrag(id);

    const handleMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      if (Math.hypot(cx - dd.startX, cy - dd.startY) > 5) dd.moved = true;
      if (dd.noMove) return;
      if (e.cancelable) e.preventDefault();
      const { x, y } = screenToCanvas(cx, cy);
      const target = nodeAtPoint(x, y, dd.exclude, dd.id);
      dropTargetRef.current = target;
      setDropTarget(target);
    };

    const handleUp = () => {
      const target = dropTargetRef.current;
      if (!dd.moved) {
        onNodeSelect(dd.id); // 動いていなければ通常の選択
      } else if (!dd.noMove && target && target !== nodes[dd.id]?.parentId && typeof onReparent === "function") {
        onReparent(dd.id, target);
      }
      nodeDragRef.current = null;
      dropTargetRef.current = null;
      setNodeDrag(null);
      setDropTarget(null);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
  };

  // キャンバスサイズ = 全ノード座標の最大値 + 余白（パン/ズームのたびに再計算しないようメモ化）
  const { totalW, totalH } = useMemo(() => {
    const posValues = Object.values(positions);
    if (!posValues.length) {
      return { totalW: NODE_W + 60, totalH: NODE_H + 80 };
    }
    let maxX = -Infinity, maxY = -Infinity;
    for (const p of posValues) { if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
    return {
      totalW: maxX + NODE_W + 60,
      totalH: maxY + NODE_H + 80,
    };
  }, [positions]);

  // ── ルートノードを画面内（上部中央）に表示する ──
  // 大きいツリーではキャンバス左上（＝最深部の葉）だけが見えてしまうため、
  // 初期表示と「表示リセット」はルートを基準にする。
  const centerOnRoot = useCallback((s = 1) => {
    const pos = rootId ? positions[rootId] : null;
    if (!pos) { setCanvasOffset({ x: 20, y: 20 }); return; }
    setCanvasOffset({
      x: 140 - (pos.x + NODE_W / 2) * s,
      y: 70 - pos.y * s,
    });
  }, [positions, rootId]);

  // 初回マウント時にルートを表示する
  const didInitViewRef = useRef(false);
  useEffect(() => {
    if (didInitViewRef.current) return;
    didInitViewRef.current = true;
    centerOnRoot(1);
  }, [centerOnRoot]);

  // ── ドラッグ操作（マウス） ──────────────────────
  const onMouseDown = useCallback((e) => {
    if (e.target.closest(".node-g")) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: canvasOffset.x, oy: canvasOffset.y };
  }, [canvasOffset]);

  const onMouseMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setCanvasOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.mx,
      y: dragStart.current.oy + e.clientY - dragStart.current.my,
    });
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  // ── ドラッグ操作（タッチ） ─────────────────────
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      // ピンチ開始：2点間距離と現在スケールを記録
      pinchStart.current = { dist: touchDist(e.touches[0], e.touches[1]), scale };
      dragStart.current  = null;
      return;
    }
    if (e.target.closest(".node-g")) return;
    const t = e.touches[0];
    dragStart.current = { mx: t.clientX, my: t.clientY, ox: canvasOffset.x, oy: canvasOffset.y };
    setDragging(true);
  }, [canvasOffset, scale]);

  const onTouchMove = useCallback((e) => {
    // ピンチズーム
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const ratio = dist / pinchStart.current.dist;
      setScale(clampScale(pinchStart.current.scale * ratio));
      return;
    }
    if (!dragStart.current) return;
    e.preventDefault();
    const t = e.touches[0];
    setCanvasOffset({
      x: dragStart.current.ox + t.clientX - dragStart.current.mx,
      y: dragStart.current.oy + t.clientY - dragStart.current.my,
    });
  }, []);

  // ── ホイールズーム（デスクトップ） ─────────────
  // React の onWheel は passive リスナーになり preventDefault が効かず
  // コンソールエラーが出るため、非 passive のネイティブリスナーで登録する
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheelNative = (e) => {
      e.preventDefault();
      setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 目次からノードを選んだとき、そのノードが画面中央に来るようにオフセットを調整する */
  const jumpToNode = useCallback((nodeId) => {
    setDrawerOpen(false);
    const pos = positions[nodeId];
    if (!pos) return;
    // キャンバスは transformOrigin 0,0 で scale 倍されるため、画面中央に合わせるには
    // ノードのキャンバス座標に scale を掛けてからオフセットを算出する
    setCanvasOffset({
      x: 140 - (pos.x + NODE_W / 2) * scale,
      y: 200 - (pos.y + NODE_H / 2) * scale,
    });
  }, [positions, scale]);

  // エッジ色→マーカーインデックスのマッピング
  const MARKER_COLORS = [
    ORIENTATION_META["攻め"].color,
    ORIENTATION_META["受け"].color,
    ORIENTATION_META["バランス"].color,
    ORIENTATION_META["不明"].color,
    T.purple,
  ];
  const markerIndex = (color) => {
    const i = MARKER_COLORS.indexOf(color);
    return i >= 0 ? i : MARKER_COLORS.length - 1;
  };

  const rootNode = rootId ? nodes[rootId] : null;

  // オンボーディングの指さし対象ノード（ルート直下の最初の子。なければルート）
  const onboardNodeId = (rootNode?.childIds || []).find((cid) => nodes[cid]) ?? rootId;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream, position: "relative" }}>
      {/* ── トップバー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xl, color: T.ink }}>{tree.name}</div>
        </div>
        {/* 目次ドロワーを開く3点ドット */}
        <div
          data-onboard="map-menu"
          onClick={() => setDrawerOpen(true)}
          style={{ display: "flex", flexDirection: "column", gap: 3.5, cursor: "pointer", padding: "6px 4px" }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ display: "block", width: 3.5, height: 3.5, borderRadius: "50%", background: T.gold }} />
          ))}
        </div>
      </div>

      {/* ── マップエリア ── */}
      <div
        ref={mapRef}
        style={{ flex: 1, overflow: "hidden", position: "relative", cursor: nodeDrag ? "grabbing" : dragging ? "grabbing" : "grab", background: T.cream, touchAction: "none", overscrollBehavior: "contain", userSelect: "none", WebkitUserSelect: "none" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove}
        onTouchEnd={() => { dragStart.current = null; pinchStart.current = null; setDragging(false); }}
      >
        {/* パンするキャンバス */}
        <div style={{
          position:        "absolute",
          left:            canvasOffset.x,
          top:             canvasOffset.y,
          transform:       `scale(${scale})`,
          transformOrigin: "0 0",
          transition:      dragging ? "none" : "left 0.35s, top 0.35s, transform 0.15s",
        }}>
          <svg width={totalW} height={totalH} style={{ overflow: "visible" }}>

            {/* 矢印マーカー定義 */}
            <defs>
              {MARKER_COLORS.map((color, i) => (
                <marker key={i} id={`arr${i}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M1 1.5L6.5 4L1 6.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              ))}
            </defs>

            {/* エッジ（ベジェ曲線） */}
            {edges.map((edge, i) => {
              const midY = (edge.y1 + edge.y2) / 2;
              const d    = `M${edge.x1},${edge.y1} C${edge.x1},${midY} ${edge.x2},${midY} ${edge.x2},${edge.y2}`;
              return (
                <path
                  key={i} d={d} fill="none"
                  stroke={edge.color} strokeWidth={1.2}
                  strokeDasharray={edge.dashed ? "5 2.5" : "none"}
                  markerEnd={`url(#arr${markerIndex(edge.color)})`}
                />
              );
            })}

            {/* 合流エッジ（追加の親 → 子）。通常エッジと同じくベジェで最短距離を結ぶ。
                始点・終点をノード中央から左右にずらして、実親からの線と重ならず
                「別系統の線」であることが分かるようにする */}
            {mergeEdges.map((edge, i) => {
              const shift = 18 + (i % 3) * 6; // 複数の合流線が重ならないよう少しずつずらす
              const sx = edge.from.x + NODE_W / 2 + shift; // 親の下辺・中央より右
              const sy = edge.from.y + NODE_H;
              const ex = edge.to.x   + NODE_W / 2 - shift; // 子の上辺・中央より左
              const ey = edge.to.y;
              const midY = (sy + ey) / 2;
              const d = `M${sx},${sy} C${sx},${midY} ${ex},${midY} ${ex},${ey}`;
              return (
                <path
                  key={`m${i}`} d={d} fill="none"
                  stroke={T.purple} strokeWidth={1.2}
                  strokeDasharray="2 3"
                  markerEnd={`url(#arr${MARKER_COLORS.length - 1})`}
                />
              );
            })}

            {/* ノード */}
            {Object.entries(positions).map(([id, pos]) => {
              const node   = nodes[id];
              if (!node) return null;

              const isRoot      = id === rootId;
              const s           = STATUS_NODE[node.status] || STATUS_NODE.todo;
              const orientMeta  = ORIENTATION_META[node.orientation] || ORIENTATION_META["不明"];

              // ルートは金色、それ以外は志向（攻め/受け/バランス/不明）の色に応じてノード色を変える
              const nodeColor = isRoot
                ? { fill: T.goldLight, stroke: T.gold }
                : { fill: orientMeta.bg, stroke: orientMeta.color };

              const isDropTarget = dropTarget === id;
              const isBeingDragged = nodeDrag === id;

              // 「よく使う」レベルに応じてノードを拡大/縮小（ルートは常に標準サイズ）
              const usageScale = isRoot ? 1 : (USAGE_META[node.usageLevel]?.scale ?? 1);
              const w = NODE_W * usageScale;
              const h = NODE_H * usageScale;
              const rx = pos.x - (w - NODE_W) / 2;
              const ry = pos.y - (h - NODE_H) / 2;
              const cx = pos.x + NODE_W / 2;
              const cy = pos.y + NODE_H / 2;

              return (
                <g
                  key={id}
                  className="node-g"
                  data-onboard={id === onboardNodeId ? "map-node" : undefined}
                  onMouseDown={(e) => { e.stopPropagation(); startNodeDrag(id, e.clientX, e.clientY); }}
                  onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; startNodeDrag(id, t.clientX, t.clientY); }}
                  style={{ cursor: "pointer", opacity: isBeingDragged ? 0.5 : 1 }}
                >
                  <rect
                    x={rx} y={ry} width={w} height={h}
                    rx={isRoot ? 9 : 6}
                    fill={isDropTarget ? T.goldBg : nodeColor.fill}
                    stroke={isDropTarget ? T.gold : node.isMergeTarget ? T.purple : nodeColor.stroke}
                    strokeWidth={isDropTarget ? 2.5 : isRoot || node.isMergeTarget ? 1.5 : 0.9}
                    strokeDasharray={s.dashed ? "5 2.5" : "none"}
                  />

                  {/* ステータスドット（ルート・todo 以外） */}
                  {!isRoot && node.status !== "todo" && (
                    <circle cx={rx + w - 8} cy={ry + 7} r={3.5} fill={STATUS_META[node.status]?.dot || T.gray} />
                  )}

                  {/* ノード名テキスト */}
                  <text
                    x={cx}
                    y={isRoot ? cy - 5 : cy}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={isRoot ? 14 : 11 * usageScale}
                    fontWeight={isRoot ? 600 : 500}
                    fill={isRoot ? "#3d2000" : s.text}
                    fontFamily={T.fontSerif}
                  >
                    {node.label}
                  </text>

                  {/* ルートノードのサブラベル */}
                  {isRoot && (
                    <text
                      x={cx} y={cy + 10}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill={T.gold} fontFamily={T.fontSerif}
                    >
                      おおもとの戦法
                    </text>
                  )}
                </g>
              );
            })}

            {/* ルートノード上の成長アイコン（ノード数に応じて変化） */}
            {rootId && positions[rootId] && (
              <text
                x={positions[rootId].x + NODE_W / 2}
                y={positions[rootId].y - 8 - growthIconSize / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={growthIconSize}
              >
                {growthIcon}
              </text>
            )}
          </svg>
        </div>

        {/* ズームコントロール（左下） */}
        <div style={{
          position:     "absolute",
          left:         18,
          bottom:       18,
          zIndex:       15,
          display:      "flex",
          flexDirection: "column",
          borderRadius: T.radius.md,
          overflow:     "hidden",
          border:       `0.5px solid ${T.inkLine}`,
          background:   T.cream,
          boxShadow:    "0 2px 10px rgba(26,15,0,0.12)",
        }}>
          {[
            { icon: "ti-plus",  onClick: () => setScale((s) => clampScale(s + 0.2)) },
            { icon: "ti-minus", onClick: () => setScale((s) => clampScale(s - 0.2)) },
            { icon: "ti-focus-2", onClick: () => { setScale(1); centerOnRoot(1); } },
          ].map((b, i) => (
            <button
              key={b.icon}
              onClick={b.onClick}
              style={{
                width: 38, height: 38, border: "none",
                borderTop: i > 0 ? `0.5px solid ${T.inkLine}` : "none",
                background: "transparent", cursor: "pointer",
                color: T.gold, fontSize: "1rem",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <i className={`ti ${b.icon}`} />
            </button>
          ))}
        </div>

        {/* 親付け替えのUndoボタン（このマインドマップを開いてからの操作を1手ずつ戻せる） */}
        {canUndoReparent && (
          <button
            onClick={onUndoReparent}
            style={{
              position:     "absolute",
              left:         18,
              bottom:       136,
              zIndex:       15,
              display:      "flex",
              alignItems:   "center",
              gap:          6,
              padding:      "9px 14px",
              borderRadius: T.radius.xl,
              border:       `0.5px solid ${T.inkLine}`,
              background:   T.cream,
              color:        T.gold,
              fontSize:     T.fontSize.md,
              fontFamily:   T.fontSerif,
              cursor:       "pointer",
              boxShadow:    "0 2px 10px rgba(26,15,0,0.12)",
            }}
          >
            <i className="ti ti-arrow-back-up" style={{ fontSize: "0.875rem" }} />
            元に戻す
          </button>
        )}

        {/* 目次ドロワー背景オーバーレイ */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(26,15,0,0.38)", zIndex: 20 }}
          />
        )}

        {/* 目次ドロワー */}
        <div style={{
          position:   "absolute",
          top: 0, right: 0, bottom: 0,
          width:      235,
          background: T.cream,
          borderLeft: `0.5px solid ${T.inkLine}`,
          transform:  drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          zIndex:     21,
          display:    "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}`, flexShrink: 0 }}>
            <span style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xl, color: T.ink, letterSpacing: "0.2em" }}>目次</span>
            <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1rem" }}>
              <i className="ti ti-x" />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <Accordion nodes={nodes} rootId={rootId} rootChildIds={rootNode?.childIds || []} onSelect={jumpToNode} />
          </div>

          {/* 一言メモ */}
          <div style={{ borderTop: `0.5px solid ${T.inkLine}`, padding: "12px 14px", flexShrink: 0 }}>
            <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <i className="ti ti-notes" style={{ fontSize: "0.75rem" }} />一言メモ
            </div>
            <textarea
              value={memoValue}
              onChange={(e) => setMemoValue(e.target.value)}
              onBlur={() => {
                const trimmed = memoValue.trim();
                if (trimmed !== (tree?.quickMemo || "").trim()) {
                  onMemoSave?.(tree.id, trimmed);
                }
              }}
              placeholder="メモをさっと入力..."
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                border: `0.5px solid ${T.inkLine}`,
                borderRadius: T.radius.md,
                background: T.goldLight,
                padding: "8px 10px",
                fontSize: T.fontSize.base,
                color: T.ink,
                fontFamily: T.fontSerif,
                resize: "none",
                outline: "none",
                lineHeight: 1.6,
              }}
              onFocus={(e) => (e.target.style.borderColor = T.gold)}
            />
          </div>
        </div>
      </div>

      {/* ── 凡例 ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "8px 16px", borderTop: `0.5px solid ${T.inkLine}`, background: T.goldLight }}>
        {["攻め", "受け", "バランス", "不明"].map((o) => (
          <div key={o} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: T.fontSize.sm, color: T.inkMid }}>
            <div style={{ width: 18, height: 2, borderRadius: 1, background: ORIENTATION_META[o].color }} />{o}
          </div>
        ))}
        {[
          { color: T.green,   label: "完成" },
          { color: T.brown,   label: "研究中" },
          { color: T.gray,    label: "未定", dashed: true },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: T.fontSize.sm, color: T.inkMid }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, border: s.dashed ? "1px dashed #888" : undefined }} />{s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

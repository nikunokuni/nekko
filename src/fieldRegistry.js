// ══════════════════════════════════════════════════
// fieldRegistry.js  ―  「項目の台帳」から行⇄オブジェクトの変換を作る仕掛け
//
//   nodeFields.js / kifuFields.js が、それぞれの台帳を渡して使う。
//   変換の中身（NULL を既定値で埋める・キー名を付け替える・更新できない項目を捨てる）は
//   どちらも同じなので、ここに一度だけ書く。
//
//   台帳ごとに書き写すと、片方だけ直したときにもう片方が古いまま残る。
//   このリポジトリで繰り返し起きているのがまさにその形の事故なので、
//   仕掛けそのものを二重に持たない。
//
//   台帳の1項目に書けること：
//     key      … アプリ内（camelCase）のキー名
//     column   … DBの列名（snake_case）
//     def      … 既定値。値が無い／NULL のときに使う。
//                 関数を書くと呼ばれる（配列・オブジェクトを共有しないため）
//     noPatch  … true なら更新（update）では変更できない。作成時にだけ決まる項目
//     noInsert … true なら作成（insert）で送らない。DB か呼び出し側が入れる項目
//     heavy    … true なら「一覧では読まない重い列」。columnList() が外す
//     structural … true なら「中身」ではなく「ツリー上の位置・つながり」を表す項目。
//                  contentPatch() が外す（別のノードから中身を写しても位置は動かさない）
// ══════════════════════════════════════════════════

const defaultOf = (f) => (typeof f.def === "function" ? f.def() : f.def);

export function createFieldMapper(FIELDS) {
  return {
    FIELDS,

    /** DBの行 → アプリ内オブジェクト。NULL・未取得は台帳の既定値で埋める。
     *  0 や "" や false は「値が入っている」ので ?? で受ける（|| だと化ける）。 */
    rowToObj(row) {
      const obj = {};
      for (const f of FIELDS) obj[f.key] = row[f.column] ?? defaultOf(f);
      return obj;
    },

    /** 作成時の引数 → insert する行。未指定の項目は台帳の既定値で埋める。 */
    toInsertRow(input) {
      const row = {};
      for (const f of FIELDS) {
        if (f.noInsert) continue;
        row[f.column] = input[f.key] ?? defaultOf(f);
      }
      return row;
    },

    /** 更新パッチ（camelCase）→ update する行（snake_case）。
     *  台帳に無いキー・noPatch の項目は黙って捨てる（打ち間違いでDBを壊さないため）。
     *  値が null / "" / false / 0 でも「渡された」なら通す（項目を空にする操作は正当）。 */
    patchToRow(patch) {
      const row = {};
      for (const f of FIELDS) {
        if (f.noPatch) continue;
        if (Object.hasOwn(patch, f.key)) row[f.column] = patch[f.key];
      }
      return row;
    },

    /** 別のオブジェクトの「中身」を丸ごと写すためのパッチを作る。
     *  structural（ツリー上の位置・つながり）と noPatch（作成時にだけ決まる項目）は外す。
     *  上書きなので、写し元で空の項目も既定値で**明示的に**含める
     *  ―― 含めないと、その項目だけ写し先の古い値が残って混ざったノードになる。
     *  写す項目を手で並べないのは、台帳に1行足したときに書き足し忘れると
     *  その項目だけ静かに写らないため（画面は壊れないので気づけない）。 */
    contentPatch(source) {
      const patch = {};
      for (const f of FIELDS) {
        if (f.noPatch || f.structural) continue;
        patch[f.key] = source?.[f.key] ?? defaultOf(f);
      }
      return patch;
    },

    /** select に渡す列名の並び。
     *  heavy（重い列）を外した一覧用のリストを作るのに使う。
     *  手で並べると1つ書き漏らしたときに、その項目だけが undefined になって
     *  静かに壊れる（kifus の meta_parsed で実際に起きた）。 */
    columnList({ includeHeavy = true, extra = [] } = {}) {
      const cols = FIELDS.filter((f) => includeHeavy || !f.heavy).map((f) => f.column);
      return [...extra, ...cols].join(", ");
    },
  };
}

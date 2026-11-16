/* 起動 */
(function () {
  'use strict';
  G.progress.load();
  G.ui.go('home');
  /* 開店の演出。アドレスの末尾に #quiet をつけると出さない（動作確認のとき用） */
  if (location.hash !== '#quiet') G.fx.opening();

  /* 動作確認用: コンソールから G.debug.solve('yaotome') で模範解を当てて採点できる */
  G.debug = {
    solve(id) {
      const level = G.levelById(id);
      const ws = new G.Workspace(level);
      ws.release();
      G.applyPlan(ws, G.planFor(level, ws), level);
      return G.score(level, ws, 1);
    },
  };
})();

// Page WeCraft : ordre des cartes, masquage des instances anciennes, sélection par plage.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanInstView, isOld, moveInOrder, rangeBetween, sortByOrder } from "../src/renderer/ui/instOrder";

test("réglages : 1 an par défaut, masquage désactivé, valeurs inconnues ignorées", () => {
  assert.deepEqual(cleanInstView(undefined), { sort: "auto", order: [], hideOld: false, hideDays: 365 });
  assert.deepEqual(cleanInstView({ sort: "manual", order: ["a", "a", 3, "b"], hideOld: true, hideDays: 90 }), { sort: "manual", order: ["a", "b"], hideOld: true, hideDays: 90 });
  assert.equal(cleanInstView({ hideDays: 12 }).hideDays, 365);
});

test("ordre manuel : connues dans l'ordre, nouvelles à la fin sans se mélanger", () => {
  const l = ["n1", "c", "a", "n2", "b"].map((id) => ({ id }));
  assert.deepEqual(sortByOrder(l, ["a", "b", "c"]).map((x) => x.id), ["a", "b", "c", "n1", "n2"]);
});

test("déplacer : une carte ou toute une sélection, avant ou après la cible", () => {
  const f = ["a", "b", "c", "d", "e"];
  assert.deepEqual(moveInOrder(f, ["e"], "b"), ["a", "e", "b", "c", "d"]);
  assert.deepEqual(moveInOrder(f, ["a"], "c", true), ["b", "c", "a", "d", "e"]);
  assert.deepEqual(moveInOrder(f, ["d", "b"], "a"), ["b", "d", "a", "c", "e"], "sélection : gardée dans l'ordre affiché");
  assert.deepEqual(moveInOrder(f, ["b"], "b"), f, "lâchée sur elle-même");
  assert.deepEqual(moveInOrder(f, ["a"], null), ["b", "c", "d", "e", "a"]);
});

test("masquage : lancée il y a plus de N jours ; jamais lancée = toujours visible", () => {
  const now = Date.UTC(2026, 10, 15);
  assert.equal(isOld({ last: now - 366 * 86_400_000 }, 365, now), true);
  assert.equal(isOld({ last: now - 10 * 86_400_000 }, 365, now), false);
  assert.equal(isOld({}, 30, now), false);
});

test("Maj+clic : plage dans l'ordre affiché, dans les deux sens", () => {
  const f = ["a", "b", "c", "d"];
  assert.deepEqual(rangeBetween(f, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(rangeBetween(f, "d", "b"), ["b", "c", "d"]);
  assert.deepEqual(rangeBetween(f, "zz", "c"), ["c"]);
});

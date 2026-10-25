// Shaders préférés : choix (préféré, secondaire, sinon rien), application sans toucher au reste.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { cleanShaderPrefs } from "../src/main/config";
import { applyShaderPrefs, chooseShader, matches, setProperties, shaderModOf } from "../src/main/launch/shaders";
import { tempDir } from "./helpers";

const on = (primary: string | null, secondary: string | null) => ({ on: true, primary, secondary });

test("noms : même pack malgré la casse, les séparateurs et un numéro de version ; pas de faux amis", () => {
  assert.ok(matches("BSL_v8.2.09.zip", "BSL"));
  assert.ok(matches("ComplementaryReimagined_r5.2.2.zip", "Complementary Reimagined"));
  assert.ok(!matches("ComplementaryReimagined_r5.2.2.zip", "Complementary"), "un autre pack de la même famille n'est pas pris");
  assert.ok(!matches("BSLX.zip", "BSL"));
  assert.ok(!matches("x.zip", ""));
});

test("règle : préféré, sinon secondaire, sinon rien (choix existant conservé) ; sans mod de shaders, rien", () => {
  const packs = ["BSL_v8.2.09.zip", "Sildurs Vibrant.zip"];
  assert.deepEqual(chooseShader(packs, "iris", on("BSL", "Sildurs Vibrant")).pack, "BSL_v8.2.09.zip");
  const b = chooseShader(packs, "iris", on("Complementary Reimagined", "Sildurs Vibrant"));
  assert.equal(b.pack, "Sildurs Vibrant.zip");
  assert.match(b.note!, /absent.*secondaire/);
  const n = chooseShader(packs, "iris", on("A", "B"));
  assert.equal(n.pack, null);
  assert.match(n.note!, /conservé/);
  assert.match(chooseShader([], "iris", on("A", null)).note!, /sans shader/);
  assert.match(chooseShader(packs, null, on("BSL", null)).note!, /aucun mod de shaders/);
  assert.deepEqual(chooseShader(packs, "iris", { on: false, primary: "BSL", secondary: null }), { pack: null, note: null });
});

test("mod de shaders : Iris ou Oculus, sinon OptiFine ; fichiers désactivés ignorés", () => {
  assert.equal(shaderModOf(["sodium.jar", "iris-mc1.21.1-1.8.0.jar"]), "iris");
  assert.equal(shaderModOf(["oculus-mc1.20.1-1.7.0.jar"]), "iris");
  assert.equal(shaderModOf(["OptiFine_1.20.1_HD_U_I6.jar"]), "optifine");
  assert.equal(shaderModOf(["iris-1.8.jar.disabled"]), null);
});

test("application : seule la ligne du shader change dans iris.properties ; rien ailleurs", async () => {
  const { dir, cleanup } = tempDir("shaders");
  try {
    mkdirSync(path.join(dir, "shaderpacks"), { recursive: true });
    mkdirSync(path.join(dir, "mods"));
    mkdirSync(path.join(dir, "config"));
    writeFileSync(path.join(dir, "shaderpacks", "BSL_v8.2.09.zip"), "x");
    writeFileSync(path.join(dir, "mods", "iris-1.8.0.jar"), "x");
    writeFileSync(path.join(dir, "config", "iris.properties"), "#Iris\nshaderPack=Ancien.zip\nmaxShadowRenderDistance=32\nenableShaders=false\n");
    const note = await applyShaderPrefs(dir, on("BSL", null));
    assert.match(note!, /BSL_v8\.2\.09\.zip \(préféré\)/);
    assert.equal(readFileSync(path.join(dir, "config", "iris.properties"), "utf8"), "#Iris\nshaderPack=BSL_v8.2.09.zip\nmaxShadowRenderDistance=32\nenableShaders=true\n");
    // préférence absente : fichier laissé tel quel
    const before = readFileSync(path.join(dir, "config", "iris.properties"), "utf8");
    await applyShaderPrefs(dir, on("Rien", null));
    assert.equal(readFileSync(path.join(dir, "config", "iris.properties"), "utf8"), before);
    assert.equal(setProperties("a=1", { b: "2" }), "a=1\nb=2\n");
    assert.deepEqual(cleanShaderPrefs({ on: true, primary: "..\\x", secondary: " BSL " }), { on: true, primary: null, secondary: "BSL" });
  } finally {
    cleanup();
  }
});

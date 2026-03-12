import { SceneIntro, initSceneIntroAnimation } from "./components/sceneIntro.js";
import { initHeroSectionAnimation } from "./components/heroSection.js";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Le conteneur #app est introuvable.");
}

// Registre initial des scenes. Il pourra accueillir d'autres composants plus tard.
const scenes = [SceneIntro];

app.innerHTML = scenes.map((scene) => scene()).join("");

initSceneIntroAnimation();
initHeroSectionAnimation();

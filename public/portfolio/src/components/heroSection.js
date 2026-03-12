const desktopHeroPath = new URL("../assets/herodesktop.png", import.meta.url).href;
const mobileHeroPath = new URL("../assets/heromobile.png", import.meta.url).href;

const HERO_WORDS = ["dev web", "designer", "gen art", "creative code"];
const HERO_SKILLS = [
  "Developpeur app web",
  "Developpeur site web",
  "Front-end creatif",
  "JavaScript modulaire",
  "Interfaces responsive",
  "Animations GSAP",
  "Scroll storytelling",
  "Creative coding",
  "Direction artistique web",
  "Prototypage interactif",
];
const HERO_EXPERIENCES = [
  "App web pour e-commerce",
  "Site web pour universite",
  "Site web pour ecole professionnelle",
  "SaaS dashboard",
  "Application web sur mesure",
  "Jeu web interactif",
  "Landing page premium",
  "Portfolio storytelling",
  "Plateforme de reservation",
  "Interface admin et CRM",
];
const HERO_ENTER_STAGGER_MS = 110;
const HERO_EXIT_STAGGER_MS = 80;
const HERO_HOLD_MS = 2100;
const HERO_GAP_MS = 320;

function wait(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function buildLetters(container, word) {
  container.textContent = "";

  return Array.from(word).map((character) => {
    const letter = document.createElement("span");
    letter.className = "hero-section__letter";
    letter.textContent = character === " " ? "\u00A0" : character;
    container.append(letter);
    return letter;
  });
}

function renderPanelRows(items) {
  return items.map(
    (item, index) => `
      <tr class="hero-section__skill-row">
        <th scope="row" class="hero-section__skill-index">${String(index + 1).padStart(2, "0")}</th>
        <td class="hero-section__skill-label">${item}</td>
      </tr>
    `,
  ).join("");
}

async function runHeroWordLoop(container, words) {
  let activeIndex = 0;

  while (container.isConnected) {
    const letters = buildLetters(container, words[activeIndex]);

    await wait(120);

    for (const letter of letters) {
      letter.classList.add("is-visible");
      await wait(HERO_ENTER_STAGGER_MS);
    }

    await wait(HERO_HOLD_MS);

    for (let index = letters.length - 1; index >= 0; index -= 1) {
      const letter = letters[index];
      letter.classList.add("is-leaving");
      letter.classList.remove("is-visible");
      await wait(HERO_EXIT_STAGGER_MS);
    }

    await wait(HERO_GAP_MS);

    activeIndex = (activeIndex + 1) % words.length;
  }
}

export function HeroSection({ embedded = false } = {}) {
  const tagName = embedded ? "div" : "section";
  const heroClassName = embedded ? "hero-section hero-section--embedded" : "hero-section";

  // Future hook: brancher ici la logique d'animation du mot actif.
  return `
    <${tagName}
      class="${heroClassName}"
      data-scene="hero"
      aria-labelledby="hero-section-name"
      style="
        --hero-bg-mobile: url('${mobileHeroPath}');
        --hero-bg-desktop: url('${desktopHeroPath}');
      "
    >
      <div class="hero-section__background" data-hero-background aria-hidden="true"></div>
      <div class="hero-section__overlay" data-hero-overlay aria-hidden="true"></div>

      <div class="hero-section__content">
        <section
          class="hero-section__panel hero-section__skills-panel"
          data-hero-skills-panel
          aria-label="Mes competences"
        >
          <p class="hero-section__skills-title">Mes competences</p>
          <table class="hero-section__skills-table">
            <tbody>
              ${renderPanelRows(HERO_SKILLS)}
            </tbody>
          </table>
        </section>

        <section
          class="hero-section__panel hero-section__experience-panel"
          data-hero-experience-panel
          aria-label="Mes experiences"
        >
          <p class="hero-section__skills-title">Mes experiences</p>
          <table class="hero-section__skills-table">
            <tbody>
              ${renderPanelRows(HERO_EXPERIENCES)}
            </tbody>
          </table>
        </section>

        <div class="hero-section__word-zone" data-hero-word-zone>
          <p class="hero-section__animated-text">
            <span
              class="hero-section__animated-word"
              data-hero-animated-word
              data-words='${JSON.stringify(HERO_WORDS)}'
            >
              ${HERO_WORDS[0]}
            </span>
          </p>
        </div>

        <div class="hero-section__name-zone" data-hero-name-zone>
          <h1 class="hero-section__name" id="hero-section-name">
            Toussaint Leo-Vitch
          </h1>
        </div>
      </div>
    </${tagName}>
  `;
}

export function initHeroSectionAnimation() {
  const wordContainer = document.querySelector("[data-hero-animated-word]");

  if (!wordContainer || wordContainer.dataset.initialized === "true") {
    return;
  }

  let words = HERO_WORDS;

  try {
    const parsedWords = JSON.parse(wordContainer.dataset.words ?? "[]");

    if (Array.isArray(parsedWords) && parsedWords.length > 0) {
      words = parsedWords;
    }
  } catch {
    words = HERO_WORDS;
  }

  wordContainer.dataset.initialized = "true";
  runHeroWordLoop(wordContainer, words);
}

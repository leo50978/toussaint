import { HeroSection } from "./heroSection.js";

const introVideoPath = new URL("../assets/introdesktop.MP4", import.meta.url).href;
const introMobileVideoPath = new URL("../assets/videomobile.mp4", import.meta.url).href;
const galaxyVideoPath = new URL("../assets/galaxy.mp4", import.meta.url).href;
const endingVideoPath = new URL("../assets/fin.mp4", import.meta.url).href;

const PROFILE_PARAGRAPHS = [
  {
    position: "bottom-left",
    text: "Je suis Leo-Vitch Toussaint, developpeur web creatif, et je construis des experiences qui melangent precision technique, image et narration.",
  },
  {
    position: "middle-right",
    text: "Le developpement web est devenu ma passion parce qu il me permet de transformer une idee en un espace vivant, interactif et accessible.",
  },
  {
    position: "bottom-right",
    text: "Je pense le digital comme une mise en scene. Chaque rythme, chaque contraste et chaque transition doivent raconter quelque chose.",
  },
  {
    position: "upper-left",
    text: "Mon regard d artiste nourrit mon code. J aime composer, experimenter et faire dialoguer esthetique, structure et emotion.",
  },
  {
    position: "center-left",
    text: "Je cherche des projets ou la technique reste propre, la direction visuelle forte, et l experience assez juste pour laisser une trace.",
  },
];

const STACK_CARDS = [
  { name: "HTML5", category: "Markup", mark: "HTML", accent: "#ff7a18" },
  { name: "CSS3", category: "Styling", mark: "CSS", accent: "#4da2ff" },
  { name: "JavaScript", category: "Logic", mark: "JS", accent: "#f5c542" },
  { name: "TypeScript", category: "Typing", mark: "TS", accent: "#4f8cff" },
  { name: "Next.js", category: "Framework", mark: "NX", accent: "#f2f2f2" },
  { name: "React", category: "UI", mark: "RE", accent: "#63d7ff" },
  { name: "GSAP", category: "Motion", mark: "GS", accent: "#8be66b" },
  { name: "ScrollTrigger", category: "Scroll", mark: "ST", accent: "#8bd86f" },
  { name: "Framer Motion", category: "Animation", mark: "FM", accent: "#9d8cff" },
  { name: "Anime.js", category: "Timeline", mark: "AN", accent: "#ffa857" },
  { name: "Three.js", category: "3D", mark: "3D", accent: "#b1f5ff" },
  { name: "Firebase", category: "Backend", mark: "FB", accent: "#ffba43" },
  { name: "SQL", category: "Data", mark: "SQL", accent: "#71f0d2" },
  { name: "PostgreSQL", category: "Database", mark: "PG", accent: "#8ab7ff" },
  { name: "Lucide", category: "Icons", mark: "LC", accent: "#f1ede6" },
  { name: "Google Fonts", category: "Typography", mark: "GF", accent: "#ff8abf" },
  { name: "GitHub", category: "Versioning", mark: "GH", accent: "#d0d5df" },
  { name: "Vercel", category: "Deploy", mark: "VC", accent: "#ffffff" },
  { name: "Figma", category: "Design", mark: "FG", accent: "#ff7d64" },
  { name: "Node.js", category: "Runtime", mark: "ND", accent: "#74d46a" },
];

const SCENE_CONFIG = {
  desktopBreakpoint: 1024,
  scrollDistance: 19200,
  focusOriginX: "50%",
  focusOriginY: "68%",
  frameStartScale: 1,
  frameMidScale: 1.48,
  frameEndScale: 1.62,
  frameShiftXPercent: 0.2,
  frameMidShiftYPercent: -1.8,
  frameEndShiftYPercent: -3.2,
  videoStartScale: 1,
  videoMidScale: 1.14,
  videoEndScale: 1.2,
  videoShiftXPercent: 0.1,
  videoMidShiftYPercent: -5.6,
  videoEndShiftYPercent: -8.2,
  shadowIntroOpacity: 0.42,
  shadowTransitionOpacity: 0.99,
  shadowDilateOpacity: 0.78,
  shadowReleaseOpacity: 0,
  shadowIntroHoleSize: "62vmax",
  shadowMidHoleSize: "34vmax",
  shadowTransitionHoleSize: "0vmax",
  shadowDilateHoleSize: "80vmax",
  shadowReleaseHoleSize: "150vmax",
  shadowIntroAt: 0.56,
  shadowTransitionAt: 0.56,
  shadowTransitionDuration: 0.28,
  shadowDilateAt: 1.02,
  shadowDilateDuration: 0.22,
  shadowReleaseAt: 1.26,
  shadowReleaseDuration: 0.18,
  heroRevealAt: 0.84,
  heroRevealDuration: 0.02,
  heroMotionAt: 1.34,
  heroMotionDuration: 0.4,
  heroNameDropY: "58vh",
  heroWordDropY: "28vh",
  skillsRevealAt: 1.62,
  skillsRevealDuration: 0.3,
  skillsInitialYPercent: -115,
  experienceRevealAt: 2.08,
  experienceRevealDuration: 0.34,
  experienceInitialYPercent: 115,
  skillsExitYPercent: -110,
  heroZoomPreludeAt: 2.92,
  heroZoomPreludeDuration: 0.24,
  heroZoomPhaseTwoAt: 3.16,
  heroZoomPhaseTwoDuration: 0.28,
  heroZoomPhaseThreeAt: 3.44,
  heroZoomPhaseThreeDuration: 0.38,
  heroZoomPhaseFourAt: 3.82,
  heroZoomPhaseFourDuration: 0.42,
  heroZoomFocusX: "72%",
  heroZoomFocusY: "25%",
  heroBackgroundStartScale: 1.02,
  heroBackgroundPreludeScale: 1.28,
  heroBackgroundPhaseTwoScale: 3.4,
  heroBackgroundPhaseThreeScale: 38,
  heroBackgroundEndScale: 150,
  heroBackgroundPreludeShiftXPercent: -1.2,
  heroBackgroundPreludeShiftYPercent: 1.4,
  heroBackgroundPhaseTwoShiftXPercent: -4.5,
  heroBackgroundPhaseTwoShiftYPercent: 4.6,
  heroBackgroundPhaseThreeShiftXPercent: -11.5,
  heroBackgroundPhaseThreeShiftYPercent: 10.8,
  heroBackgroundShiftXPercent: -18,
  heroBackgroundShiftYPercent: 17,
  heroOverlayZoomOpacity: 0.48,
  heroOverlayPreludeOpacity: 0.9,
  heroOverlayPhaseTwoOpacity: 0.78,
  heroOverlayPhaseThreeOpacity: 0.62,
  heroContentFadeAt: 2.6,
  heroContentFadeDuration: 0.22,
  heroExitAt: 4.24,
  heroExitDuration: 0.54,
  heroExitOpacity: 0,
  galaxyRevealAt: 4.56,
  galaxyRevealDuration: 0.72,
  galaxyStartScale: 1.14,
  galaxyEndScale: 1,
  galaxyStartOpacity: 0,
  galaxyEndOpacity: 1,
  galaxyOverlayStartOpacity: 0.72,
  galaxyOverlayEndOpacity: 0.24,
  galaxyPlaybackAt: 4.56,
  galaxyPlaybackEndAt: 9.92,
  profileSequenceStartAt: 5.54,
  profileParagraphStep: 0.84,
  profileParagraphInDuration: 0.22,
  profileParagraphHoldDuration: 0.34,
  profileParagraphOutDuration: 0.2,
  stackRevealAt: 10.12,
  stackRevealDuration: 0.82,
  stackLayerStartOpacity: 0,
  stackLayerEndOpacity: 1,
  stackLayerStartYPercent: 112,
  stackLayerEndYPercent: 0,
  galaxyExitAt: 10.02,
  galaxyExitDuration: 0.86,
  galaxyExitYPercent: 108,
  galaxyExitOpacity: 1,
  galaxyExitScale: 1,
  stackExitAt: 11.72,
  stackExitDuration: 0.72,
  stackExitOpacity: 0,
  stackExitYPercent: -18,
  stackExitScale: 0.96,
  endingRevealAt: 11.86,
  endingRevealDuration: 0.78,
  endingLayerStartOpacity: 0,
  endingLayerEndOpacity: 1,
  endingLayerStartYPercent: 10,
  endingLayerEndYPercent: 0,
  endingVideoStartScale: 1.08,
  endingVideoEndScale: 1,
  endingOverlayStartOpacity: 0.54,
  endingOverlayEndOpacity: 0.2,
  endingPlaybackAt: 11.9,
  videoFadeAt: 0.84,
  videoFadeDuration: 0.04,
  videoFadeEndOpacity: 0,
  radiusStart: 0,
  radiusEnd: 0,
};

const RESET_SEQUENCE = {
  blackoutSteps: [0.26, 0.52, 0.78, 1],
  blackoutStepDuration: 0.72,
  blackoutGapDuration: 0.28,
  autoScrollDurationMs: 2600,
  blackoutHoldAtTopDuration: 3,
  blackoutReleaseSteps: [0.97, 0.92, 0.85, 0.76, 0.66, 0.55, 0.44, 0.33, 0.24, 0.16, 0.09, 0.04, 0],
  blackoutReleaseStepDuration: 0.28,
  blackoutReleaseGapDuration: 0.04,
};

const GUIDANCE_CONFIG = {
  toastVisibleMs: 2600,
  toastCooldownMs: 2200,
};

const EXCESSIVE_SCROLL_CONFIG = {
  singleDeltaThreshold: 900,
  burstDeltaThreshold: 1650,
  burstWindowMs: 420,
};

const SCROLL_CONTROL_CONFIG = {
  clickStepPx: 280,
  minViewportRatio: 0.2,
};

const MOBILE_SCENE_CONFIG = {
  scrollDistance: 9800,
  focusOriginX: "50%",
  focusOriginY: "0%",
  frameStartScale: 1,
  frameEndScale: 1.58,
  frameShiftYPercent: -32,
  videoStartScale: 1,
  videoEndScale: 1.56,
  videoShiftYPercent: -52,
  videoStartObjectPosition: "50% 50%",
  videoEndObjectPosition: "50% -12%",
  shadowIntroOpacity: 0.68,
  shadowTransitionOpacity: 0.97,
  shadowReleaseOpacity: 0,
  shadowIntroHoleSize: "58vmax",
  shadowMidHoleSize: "30vmax",
  shadowTransitionHoleSize: "0vmax",
  shadowReleaseHoleSize: "132vmax",
  shadowIntroDuration: 0.68,
  shadowTransitionAt: 0.68,
  shadowTransitionDuration: 0.28,
  shadowReleaseAt: 1.08,
  shadowReleaseDuration: 0.24,
  heroRevealAt: 0.74,
  heroRevealDuration: 0.04,
  heroMotionAt: 1.24,
  heroMotionDuration: 0.34,
  heroNameExitXPercent: -42,
  heroWordExitXPercent: -34,
  heroExitYPercent: 2,
  heroSkillsRevealAt: 1.24,
  heroSkillsRevealDuration: 0.36,
  heroSkillsInitialXPercent: 112,
  heroSkillsExitAt: 1.72,
  heroSkillsExitDuration: 0.34,
  heroSkillsExitXPercent: 112,
  heroExperienceRevealAt: 1.72,
  heroExperienceRevealDuration: 0.36,
  heroExperienceInitialXPercent: -112,
  heroExperienceExitAt: 2.16,
  heroExperienceExitDuration: 0.34,
  heroExperienceExitYPercent: -120,
  heroZoomFocusX: "46%",
  heroZoomFocusY: "22%",
  heroZoomPhaseOneAt: 2.34,
  heroZoomPhaseOneDuration: 0.34,
  heroZoomPhaseOneScale: 3.64,
  heroZoomPhaseOneShiftYPercent: -10,
  heroZoomPhaseTwoAt: 2.68,
  heroZoomPhaseTwoDuration: 0.44,
  heroZoomPhaseTwoScale: 25.48,
  heroZoomPhaseTwoShiftYPercent: -22,
  heroZoomPhaseThreeAt: 3.12,
  heroZoomPhaseThreeDuration: 0.6,
  heroZoomPhaseThreeScale: 77.31,
  heroZoomPhaseThreeShiftYPercent: -29,
  heroOverlayZoomOpacity: 0.56,
  heroExitAt: 3.86,
  heroExitDuration: 0.44,
  heroExitOpacity: 0,
  galaxyRevealAt: 4.04,
  galaxyRevealDuration: 0.72,
  galaxyStartScale: 1.14,
  galaxyEndScale: 1,
  galaxyStartOpacity: 0,
  galaxyEndOpacity: 1,
  galaxyOverlayStartOpacity: 0.72,
  galaxyOverlayEndOpacity: 0.24,
  galaxyPlaybackAt: 4.04,
  profileSequenceStartAt: 4.46,
  profileParagraphStep: 0.76,
  profileParagraphInDuration: 0.22,
  profileParagraphHoldDuration: 0.34,
  profileParagraphOutDuration: 0.2,
  stackRevealAt: 8.48,
  stackRevealDuration: 0.72,
  stackLayerStartOpacity: 0,
  stackLayerEndOpacity: 1,
  stackLayerStartYPercent: 112,
  stackLayerEndYPercent: 0,
  stackExitAt: 10.02,
  stackExitDuration: 0.72,
  stackExitOpacity: 0,
  stackExitYPercent: -18,
  stackExitScale: 0.96,
  endingRevealAt: 10.18,
  endingRevealDuration: 0.78,
  endingLayerStartOpacity: 0,
  endingLayerEndOpacity: 1,
  endingLayerStartYPercent: 10,
  endingLayerEndYPercent: 0,
  endingVideoStartScale: 1.08,
  endingVideoEndScale: 1,
  endingOverlayStartOpacity: 0.54,
  endingOverlayEndOpacity: 0.2,
  endingPlaybackAt: 10.22,
  galaxyExitAt: 8.34,
  galaxyExitDuration: 0.82,
  galaxyExitYPercent: 108,
  galaxyExitOpacity: 1,
  videoFadeAt: 0.74,
  videoFadeDuration: 0.08,
  videoFadeEndOpacity: 0,
};

const GUIDE_MODAL_STORAGE_KEY = "portfolio-guide-dismissed";

function renderProfileParagraphs() {
  return PROFILE_PARAGRAPHS.map(
    (paragraph, index) => `
      <p
        class="scene-intro__profile-paragraph scene-intro__profile-paragraph--${paragraph.position}"
        data-profile-paragraph
        data-profile-index="${index}"
      >
        ${paragraph.text}
      </p>
    `,
  ).join("");
}

function buildStackCardIcon(card) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${card.name}">
      <defs>
        <linearGradient id="stack-gradient" x1="10%" y1="8%" x2="88%" y2="92%">
          <stop offset="0%" stop-color="${card.accent}" stop-opacity="0.98" />
          <stop offset="100%" stop-color="#06070c" stop-opacity="1" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="24" fill="#05070d" />
      <rect x="6" y="6" width="84" height="84" rx="20" fill="url(#stack-gradient)" />
      <rect x="12" y="12" width="72" height="72" rx="16" fill="rgba(4, 6, 12, 0.28)" />
      <circle cx="72" cy="24" r="6" fill="rgba(247, 243, 236, 0.92)" />
      <text
        x="48"
        y="57"
        fill="#f7f3ec"
        font-size="24"
        font-weight="700"
        font-family="Manrope, Arial, sans-serif"
        letter-spacing="-1"
        text-anchor="middle"
      >
        ${card.mark}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderStackCards() {
  return STACK_CARDS.map(
    (card, index) => `
      <article class="scene-intro__stack-card" style="--stack-index: ${index}">
        <div class="scene-intro__stack-card-media">
          <img
            class="scene-intro__stack-card-icon"
            src="${buildStackCardIcon(card)}"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div class="scene-intro__stack-card-copy">
          <span class="scene-intro__stack-card-type">${card.category}</span>
          <h3 class="scene-intro__stack-card-name">${card.name}</h3>
        </div>
      </article>
    `,
  ).join("");
}

function smoothScrollToTop(durationMs) {
  return new Promise((resolve) => {
    const startY = window.scrollY;

    if (startY <= 1) {
      window.scrollTo(0, 0);
      resolve();
      return;
    }

    const startTime = window.performance.now();
    const easeInOutCubic = (progress) =>
      progress < 0.5 ? 4 * progress * progress * progress : 1 - ((-2 * progress + 2) ** 3) / 2;

    const step = (now) => {
      const rawProgress = Math.min((now - startTime) / durationMs, 1);
      const easedProgress = easeInOutCubic(rawProgress);
      const nextY = startY * (1 - easedProgress);

      window.scrollTo(0, nextY);

      if (rawProgress < 1) {
        window.requestAnimationFrame(step);
        return;
      }

      window.scrollTo(0, 0);
      resolve();
    };

    window.requestAnimationFrame(step);
  });
}

export function SceneIntro() {
  return `
    <section class="scene-intro" data-scene="intro" aria-label="Intro scroll video">
      <div class="scene-intro__viewport">
        <div class="scene-intro__stage">
          <div class="scene-intro__video-shell">
            <video
              class="intro-video"
              src="${introVideoPath}"
              data-desktop-src="${introVideoPath}"
              data-mobile-src="${introMobileVideoPath}"
              autoplay
              muted
              loop
              playsinline
              preload="auto"
            ></video>
          </div>

          <div class="scene-intro__shadow-layer" aria-hidden="true"></div>
          <section class="scene-intro__stack-layer" data-stack-layer aria-label="Stack et outils">
            <div class="scene-intro__stack-copy">
              <h2 class="scene-intro__stack-title">Voici les stack que j utilise.</h2>
            </div>

            <div class="scene-intro__stack-carousel" aria-hidden="true">
              <div
                class="scene-intro__stack-track"
                style="--stack-angle-step: ${360 / STACK_CARDS.length}deg"
              >
                ${renderStackCards()}
              </div>
            </div>
          </section>
          <div class="scene-intro__ending-layer" data-ending-layer>
            <video
              class="scene-intro__ending-video"
              src="${endingVideoPath}"
              muted
              playsinline
              preload="auto"
            ></video>
            <div class="scene-intro__ending-overlay" data-ending-overlay aria-hidden="true"></div>
          </div>
          <div class="scene-intro__galaxy-layer">
            <video
              class="scene-intro__galaxy-video"
              src="${galaxyVideoPath}"
              muted
              loop
              playsinline
              preload="auto"
            ></video>
            <div class="scene-intro__galaxy-overlay" aria-hidden="true"></div>
            <div class="scene-intro__profile-copy" data-profile-copy>
              ${renderProfileParagraphs()}
            </div>
          </div>
          <div class="scene-intro__hero-layer">
            ${HeroSection({ embedded: true })}
          </div>
          <div class="scene-intro__blackout-layer" data-blackout-layer aria-hidden="true"></div>
          <div class="scene-intro__guide-modal" data-guide-modal aria-hidden="true">
            <div class="scene-intro__guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
              <p class="scene-intro__guide-eyebrow">Mode d emploi</p>
              <h2 class="scene-intro__guide-title" id="guide-title" data-guide-title>C est un site immersif. Continue a scroller pour reveler chaque scene.</h2>
              <div class="scene-intro__guide-visuals" data-guide-visuals aria-hidden="true">
                <div class="scene-intro__guide-visual">
                  <div class="scene-intro__mouse-icon">
                    <span class="scene-intro__mouse-wheel"></span>
                  </div>
                  <p class="scene-intro__guide-visual-label">Molette de la souris</p>
                </div>
                <div class="scene-intro__guide-visual">
                  <div class="scene-intro__guide-scroll-button-visual">
                    <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
                  </div>
                  <p class="scene-intro__guide-visual-label">Bouton de scroll au milieu a droite</p>
                </div>
              </div>
              <p class="scene-intro__guide-copy" data-guide-copy>
                Prends ton temps. Le site avance scene par scene au scroll. Sur desktop, tu peux utiliser la molette ou le bouton rond a droite pour garder un rythme fluide.
              </p>
              <p class="scene-intro__guide-note" data-guide-note>
                L ascenseur de droite est volontairement cache pour le design et l immersion. Ce n est pas un probleme de ton PC.
              </p>
              <div class="scene-intro__guide-actions">
                <button class="scene-intro__guide-button scene-intro__guide-button--ghost" type="button" data-guide-dismiss-forever>
                  Ne plus afficher
                </button>
                <button class="scene-intro__guide-button" type="button" data-guide-dismiss>
                  Entrer dans le site
                </button>
              </div>
            </div>
          </div>
          <div class="scene-intro__overscroll-modal" data-overscroll-modal aria-hidden="true">
            <div class="scene-intro__overscroll-card" role="dialog" aria-modal="true" aria-labelledby="overscroll-title">
              <p class="scene-intro__guide-eyebrow">Ralentis</p>
              <h2 class="scene-intro__guide-title" id="overscroll-title">Tu scrolles trop vite et tu casses l experience.</h2>
              <p class="scene-intro__guide-copy">
                Ce site est pense pour etre savoure scene par scene. Ralentis ton scroll pour laisser vivre les transitions, les zooms et les changements d ambiance.
              </p>
              <button class="scene-intro__guide-button" type="button" data-overscroll-dismiss>
                D accord
              </button>
            </div>
          </div>
          <div class="scene-intro__scroll-toast" data-scroll-toast aria-live="polite"></div>
          <button
            class="scene-intro__scroll-control"
            type="button"
            data-scroll-control
            aria-label="Scroller vers le bas"
          >
            <span class="scene-intro__scroll-control-ring" aria-hidden="true"></span>
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>
  `;
}

export function initSceneIntroAnimation() {
  const scene = document.querySelector('[data-scene="intro"]');
  const viewport = scene?.querySelector(".scene-intro__viewport");
  const videoShell = scene?.querySelector(".scene-intro__video-shell");
  const video = scene?.querySelector(".intro-video");
  const shadowLayer = scene?.querySelector(".scene-intro__shadow-layer");
  const galaxyLayer = scene?.querySelector(".scene-intro__galaxy-layer");
  const galaxyVideo = scene?.querySelector(".scene-intro__galaxy-video");
  const galaxyOverlay = scene?.querySelector(".scene-intro__galaxy-overlay");
  const profileParagraphs = Array.from(scene?.querySelectorAll("[data-profile-paragraph]") ?? []);
  const stackLayer = scene?.querySelector("[data-stack-layer]");
  const endingLayer = scene?.querySelector("[data-ending-layer]");
  const endingVideo = scene?.querySelector(".scene-intro__ending-video");
  const endingOverlay = scene?.querySelector("[data-ending-overlay]");
  const heroLayer = scene?.querySelector(".scene-intro__hero-layer");
  const blackoutLayer = scene?.querySelector("[data-blackout-layer]");
  const guideModal = scene?.querySelector("[data-guide-modal]");
  const guideDismissButton = scene?.querySelector("[data-guide-dismiss]");
  const guideDismissForeverButton = scene?.querySelector("[data-guide-dismiss-forever]");
  const overscrollModal = scene?.querySelector("[data-overscroll-modal]");
  const overscrollDismissButton = scene?.querySelector("[data-overscroll-dismiss]");
  const scrollToast = scene?.querySelector("[data-scroll-toast]");
  const scrollControlButton = scene?.querySelector("[data-scroll-control]");
  const guideTitle = scene?.querySelector("[data-guide-title]");
  const guideCopy = scene?.querySelector("[data-guide-copy]");
  const guideNote = scene?.querySelector("[data-guide-note]");
  const guideVisuals = scene?.querySelector("[data-guide-visuals]");
  const heroSection = heroLayer?.querySelector('[data-scene="hero"]');
  const heroContent = heroSection?.querySelector(".hero-section__content");
  const heroNameZone = heroSection?.querySelector("[data-hero-name-zone]");
  const heroWordZone = heroSection?.querySelector("[data-hero-word-zone]");
  const heroSkillsPanel = heroSection?.querySelector("[data-hero-skills-panel]");
  const heroExperiencePanel = heroSection?.querySelector("[data-hero-experience-panel]");
  const heroBackground = heroSection?.querySelector("[data-hero-background]");
  const heroOverlay = heroSection?.querySelector("[data-hero-overlay]");
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const applyIntroVideoSource = (videoSource) => {
    if (!videoSource || video.getAttribute("src") === videoSource) {
      return;
    }

    video.setAttribute("src", videoSource);
    video.load();
  };

  if (
    !scene ||
    !viewport ||
    !videoShell ||
    !video ||
    !shadowLayer ||
    !stackLayer ||
    !endingLayer ||
    !endingVideo ||
    !endingOverlay ||
    !galaxyLayer ||
    !galaxyVideo ||
    !galaxyOverlay ||
    !heroLayer ||
    !blackoutLayer ||
    !guideModal ||
    !guideDismissButton ||
    !guideDismissForeverButton ||
    !overscrollModal ||
    !overscrollDismissButton ||
    !scrollToast ||
    !scrollControlButton ||
    !guideTitle ||
    !guideCopy ||
    !guideNote ||
    !guideVisuals ||
    !gsap ||
    !ScrollTrigger ||
    scene.dataset.initialized === "true"
  ) {
    return;
  }

  if (window.innerWidth < SCENE_CONFIG.desktopBreakpoint) {
    applyIntroVideoSource(video.dataset.mobileSrc ?? introMobileVideoPath);
    scene.dataset.initialized = "true";
    shadowLayer.style.display = "none";
    stackLayer.style.display = "block";
    endingLayer.style.display = "block";
    galaxyLayer.style.display = "block";
    blackoutLayer.style.display = "block";
    guideModal.style.display = "grid";
    overscrollModal.style.display = "grid";
    scrollToast.style.display = "block";
    scrollControlButton.style.display = "none";
    guideTitle.textContent = "Ceci est un site immersif. Continue a scroller pour deguster le produit de mon art.";
    guideCopy.textContent =
      "Prends ton temps et laisse le site se reveler scene par scene. Continue a scroller pour vivre l experience jusqu au bout.";
    guideNote.textContent = "C est une narration visuelle. Continue simplement a scroller.";
    guideVisuals.style.display = "none";
    heroLayer.style.display = "block";
    videoShell.style.display = "block";
    shadowLayer.style.display = "block";
    document.body.append(guideModal);
    document.body.append(overscrollModal);
    document.body.append(scrollToast);
    document.body.append(blackoutLayer);
    videoShell.style.opacity = "1";
    heroLayer.style.opacity = "0";
    video.style.opacity = "1";
    video.currentTime = 0;
    gsap.registerPlugin(ScrollTrigger);
    gsap.set([videoShell, video], {
      transformOrigin: `${MOBILE_SCENE_CONFIG.focusOriginX} ${MOBILE_SCENE_CONFIG.focusOriginY}`,
    });
    gsap.set(video, {
      objectPosition: MOBILE_SCENE_CONFIG.videoStartObjectPosition,
    });
    gsap.set(shadowLayer, {
      opacity: 0,
      "--shadow-hole-size": MOBILE_SCENE_CONFIG.shadowIntroHoleSize,
    });
    gsap.set(heroLayer, {
      opacity: 0,
    });

    if (heroContent) {
      gsap.set(heroContent, {
        autoAlpha: 1,
        clearProps: "transform",
      });
    }

    if (heroBackground) {
      gsap.set(heroBackground, {
        scale: 1.02,
        xPercent: 0,
        yPercent: 0,
        transformOrigin: `${MOBILE_SCENE_CONFIG.heroZoomFocusX} ${MOBILE_SCENE_CONFIG.heroZoomFocusY}`,
      });
    }

    if (heroOverlay) {
      gsap.set(heroOverlay, {
        opacity: 1,
      });
    }

    gsap.set(galaxyLayer, {
      opacity: MOBILE_SCENE_CONFIG.galaxyStartOpacity,
      yPercent: 0,
      scale: 1,
    });

    gsap.set(galaxyVideo, {
      scale: MOBILE_SCENE_CONFIG.galaxyStartScale,
    });

    gsap.set(galaxyOverlay, {
      opacity: MOBILE_SCENE_CONFIG.galaxyOverlayStartOpacity,
    });

    if (profileParagraphs.length > 0) {
      gsap.set(profileParagraphs, {
        autoAlpha: 0,
        yPercent: 18,
        filter: "blur(12px)",
      });
    }

    gsap.set(stackLayer, {
      autoAlpha: MOBILE_SCENE_CONFIG.stackLayerStartOpacity,
      yPercent: MOBILE_SCENE_CONFIG.stackLayerStartYPercent,
    });

    gsap.set(endingLayer, {
      autoAlpha: MOBILE_SCENE_CONFIG.endingLayerStartOpacity,
      yPercent: MOBILE_SCENE_CONFIG.endingLayerStartYPercent,
    });

    gsap.set(endingVideo, {
      scale: MOBILE_SCENE_CONFIG.endingVideoStartScale,
    });

    gsap.set(endingOverlay, {
      opacity: MOBILE_SCENE_CONFIG.endingOverlayStartOpacity,
    });

    gsap.set(blackoutLayer, {
      autoAlpha: 0,
    });

    if (heroSkillsPanel) {
      gsap.set(heroSkillsPanel, {
        autoAlpha: 0,
        xPercent: MOBILE_SCENE_CONFIG.heroSkillsInitialXPercent,
      });
    }

    if (heroExperiencePanel) {
      gsap.set(heroExperiencePanel, {
        autoAlpha: 0,
        xPercent: MOBILE_SCENE_CONFIG.heroExperienceInitialXPercent,
      });
    }

    let mobileGuideModalOpen = true;
    let mobileGuideModalDismissedForever = false;
    let mobileOverscrollModalOpen = false;
    let mobileEndingResetActive = false;
    let mobileToastHideTimer = 0;
    let mobileLastHintAt = 0;
    let mobileLastEndingHintAt = 0;
    let mobileLastTouchTimestamp = 0;
    let mobileExcessiveScrollDelta = 0;
    let mobileTouchStartY = 0;

    let mobileGalaxyPlaybackActive = false;
    let mobileEndingPlaybackActive = false;

    const mobileAnimateTo = (target, vars) =>
      new Promise((resolve) => {
        gsap.to(target, {
          ...vars,
          onComplete: resolve,
        });
      });

    const mobileSetScrollLock = (isLocked) => {
      const overflowValue = isLocked ? "hidden" : "";

      document.documentElement.style.overflow = overflowValue;
      document.body.style.overflow = overflowValue;
    };

    const mobileShowScrollToast = (message) => {
      window.clearTimeout(mobileToastHideTimer);
      scrollToast.textContent = message;
      gsap.killTweensOf(scrollToast);
      gsap.set(scrollToast, {
        y: 18,
        autoAlpha: 1,
      });
      gsap.to(scrollToast, {
        duration: 0.32,
        y: 0,
        autoAlpha: 1,
        ease: "power2.out",
      });

      mobileToastHideTimer = window.setTimeout(() => {
        gsap.to(scrollToast, {
          duration: 0.32,
          y: 12,
          autoAlpha: 0,
          ease: "power2.in",
        });
      }, GUIDANCE_CONFIG.toastVisibleMs);
    };

    const dismissMobileGuideModal = () => {
      if (!mobileGuideModalOpen) {
        return;
      }

      mobileGuideModalOpen = false;
      mobileSetScrollLock(false);
      gsap.to(guideModal, {
        duration: 0.45,
        autoAlpha: 0,
        ease: "power2.out",
      });
      mobileShowScrollToast("Continue a scroller. Le site se revele scene par scene.");
    };

    const dismissMobileGuideModalForever = () => {
      mobileGuideModalDismissedForever = true;

      try {
        window.localStorage.setItem(GUIDE_MODAL_STORAGE_KEY, "true");
      } catch {
        // Ignore storage failures and keep the session functional.
      }

      dismissMobileGuideModal();
    };

    const openMobileOverscrollModal = () => {
      if (mobileOverscrollModalOpen) {
        return;
      }

      mobileOverscrollModalOpen = true;
      window.clearTimeout(mobileToastHideTimer);
      gsap.killTweensOf(scrollToast);
      gsap.to(scrollToast, {
        duration: 0.2,
        autoAlpha: 0,
        y: 12,
        ease: "power2.out",
      });
      mobileSetScrollLock(true);
      gsap.to(overscrollModal, {
        duration: 0.22,
        autoAlpha: 1,
        ease: "power2.out",
      });
    };

    const dismissMobileOverscrollModal = () => {
      if (!mobileOverscrollModalOpen) {
        return;
      }

      mobileOverscrollModalOpen = false;
      mobileExcessiveScrollDelta = 0;
      mobileLastTouchTimestamp = 0;
      mobileSetScrollLock(false);
      gsap.to(overscrollModal, {
        duration: 0.32,
        autoAlpha: 0,
        ease: "power2.out",
      });
      mobileShowScrollToast("Continue a scroller plus lentement pour savourer la narration.");
    };

    const maybeShowMobileUpscrollHint = () => {
      const now = window.performance.now();

      if (now - mobileLastHintAt < GUIDANCE_CONFIG.toastCooldownMs) {
        return;
      }

      mobileLastHintAt = now;
      mobileShowScrollToast("Continue a scroller vers le bas. C est un site immersif.");
    };

    const maybeShowMobileEndingHint = () => {
      const now = window.performance.now();

      if (now - mobileLastEndingHintAt < GUIDANCE_CONFIG.toastCooldownMs) {
        return;
      }

      mobileLastEndingHintAt = now;
      mobileShowScrollToast("Ceci est la fin. Continue doucement et laisse l animation se terminer.");
    };

    const playMobileGalaxyVideo = () => {
      if (mobileGalaxyPlaybackActive) {
        return;
      }

      mobileGalaxyPlaybackActive = true;
      galaxyVideo.play().catch(() => {
        // Autoplay can still be blocked in some embedded contexts.
      });
    };

    const resetMobileGalaxyVideo = () => {
      if (!mobileGalaxyPlaybackActive && galaxyVideo.currentTime === 0) {
        return;
      }

      mobileGalaxyPlaybackActive = false;
      galaxyVideo.pause();

      if (galaxyVideo.readyState >= 1) {
        galaxyVideo.currentTime = 0;
      }
    };

    const playMobileEndingVideo = () => {
      if (mobileEndingPlaybackActive) {
        return;
      }

      if (
        endingVideo.readyState >= 1 &&
        Number.isFinite(endingVideo.duration) &&
        endingVideo.currentTime >= Math.max(endingVideo.duration - 0.12, 0)
      ) {
        endingVideo.currentTime = 0;
      }

      mobileEndingPlaybackActive = true;
      endingVideo.play().catch(() => {
        // Autoplay can still be blocked in some embedded contexts.
      });
    };

    const resetMobileEndingVideo = () => {
      if (!mobileEndingPlaybackActive && endingVideo.currentTime === 0) {
        return;
      }

      mobileEndingPlaybackActive = false;
      endingVideo.pause();

      if (endingVideo.readyState >= 1) {
        endingVideo.currentTime = 0;
      }
    };

    const runMobileEndingResetSequence = async () => {
      if (mobileEndingResetActive) {
        return;
      }

      mobileEndingResetActive = true;
      mobileEndingPlaybackActive = false;
      endingVideo.pause();
      mobileSetScrollLock(true);

      gsap.set(blackoutLayer, {
        autoAlpha: 0,
      });

      for (const opacity of RESET_SEQUENCE.blackoutSteps) {
        await mobileAnimateTo(blackoutLayer, {
          duration: RESET_SEQUENCE.blackoutStepDuration,
          autoAlpha: opacity,
          ease: "sine.inOut",
        });

        if (opacity < 1) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, RESET_SEQUENCE.blackoutGapDuration * 1000);
          });
        }
      }

      await smoothScrollToTop(RESET_SEQUENCE.autoScrollDurationMs);
      resetMobileGalaxyVideo();
      resetMobileEndingVideo();

      video.play().catch(() => {
        // Autoplay can still be blocked in some embedded contexts.
      });

      await new Promise((resolve) => {
        window.setTimeout(resolve, RESET_SEQUENCE.blackoutHoldAtTopDuration * 1000);
      });

      for (const opacity of RESET_SEQUENCE.blackoutReleaseSteps) {
        await mobileAnimateTo(blackoutLayer, {
          duration: RESET_SEQUENCE.blackoutReleaseStepDuration,
          autoAlpha: opacity,
          ease: "sine.out",
        });

        if (opacity > 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, RESET_SEQUENCE.blackoutReleaseGapDuration * 1000);
          });
        }
      }

      mobileEndingResetActive = false;
      mobileSetScrollLock(false);
      ScrollTrigger.refresh();
    };

    gsap.set(guideModal, {
      autoAlpha: 1,
    });

    gsap.set(overscrollModal, {
      autoAlpha: 0,
    });

    gsap.set(scrollToast, {
      autoAlpha: 0,
      y: 12,
    });

    try {
      mobileGuideModalDismissedForever =
        window.localStorage.getItem(GUIDE_MODAL_STORAGE_KEY) === "true";
    } catch {
      mobileGuideModalDismissedForever = false;
    }

    if (mobileGuideModalDismissedForever) {
      mobileGuideModalOpen = false;
      gsap.set(guideModal, {
        autoAlpha: 0,
      });
    } else {
      mobileSetScrollLock(true);
    }

    const mobileTimeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: scene,
          start: "top top",
          end: `+=${MOBILE_SCENE_CONFIG.scrollDistance}`,
          pin: viewport,
          scrub: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            const currentTime = self.animation?.time() ?? 0;

            if (mobileEndingResetActive) {
              resetMobileGalaxyVideo();
              resetMobileEndingVideo();
              return;
            }

            if (currentTime >= MOBILE_SCENE_CONFIG.galaxyPlaybackAt) {
              playMobileGalaxyVideo();
            } else {
              resetMobileGalaxyVideo();
            }

            if (currentTime >= MOBILE_SCENE_CONFIG.endingPlaybackAt) {
              playMobileEndingVideo();
            } else {
              resetMobileEndingVideo();
            }

            if (currentTime >= MOBILE_SCENE_CONFIG.endingRevealAt) {
              maybeShowMobileEndingHint();
            }
          },
        },
      });

    mobileTimeline
      .to(
        videoShell,
        {
          duration: 1,
          scale: MOBILE_SCENE_CONFIG.frameEndScale,
          yPercent: MOBILE_SCENE_CONFIG.frameShiftYPercent,
        },
        0,
      )
      .to(
        video,
        {
          duration: 1,
          scale: MOBILE_SCENE_CONFIG.videoEndScale,
          yPercent: MOBILE_SCENE_CONFIG.videoShiftYPercent,
          objectPosition: MOBILE_SCENE_CONFIG.videoEndObjectPosition,
        },
        0,
      )
      .to(
        shadowLayer,
        {
          duration: MOBILE_SCENE_CONFIG.shadowIntroDuration,
          opacity: MOBILE_SCENE_CONFIG.shadowIntroOpacity,
          "--shadow-hole-size": MOBILE_SCENE_CONFIG.shadowMidHoleSize,
        },
        0,
      )
      .to(
        shadowLayer,
        {
          duration: MOBILE_SCENE_CONFIG.shadowTransitionDuration,
          opacity: MOBILE_SCENE_CONFIG.shadowTransitionOpacity,
          "--shadow-hole-size": MOBILE_SCENE_CONFIG.shadowTransitionHoleSize,
        },
        MOBILE_SCENE_CONFIG.shadowTransitionAt,
      )
      .to(
        videoShell,
        {
          duration: MOBILE_SCENE_CONFIG.videoFadeDuration,
          opacity: MOBILE_SCENE_CONFIG.videoFadeEndOpacity,
        },
        MOBILE_SCENE_CONFIG.videoFadeAt,
      )
      .to(
        heroLayer,
        {
          duration: MOBILE_SCENE_CONFIG.heroRevealDuration,
          opacity: 1,
        },
        MOBILE_SCENE_CONFIG.heroRevealAt,
      )
      .to(
        shadowLayer,
        {
          duration: MOBILE_SCENE_CONFIG.shadowReleaseDuration,
          opacity: MOBILE_SCENE_CONFIG.shadowReleaseOpacity,
          "--shadow-hole-size": MOBILE_SCENE_CONFIG.shadowReleaseHoleSize,
        },
        MOBILE_SCENE_CONFIG.shadowReleaseAt,
      )
      .to(
        heroNameZone,
        {
          duration: MOBILE_SCENE_CONFIG.heroMotionDuration,
          xPercent: MOBILE_SCENE_CONFIG.heroNameExitXPercent,
          yPercent: MOBILE_SCENE_CONFIG.heroExitYPercent,
          autoAlpha: 0,
        },
        MOBILE_SCENE_CONFIG.heroMotionAt,
      )
      .to(
        heroWordZone,
        {
          duration: MOBILE_SCENE_CONFIG.heroMotionDuration,
          xPercent: MOBILE_SCENE_CONFIG.heroWordExitXPercent,
          yPercent: MOBILE_SCENE_CONFIG.heroExitYPercent,
          autoAlpha: 0,
        },
        MOBILE_SCENE_CONFIG.heroMotionAt,
      )
      .to(
        heroSkillsPanel,
        {
          duration: MOBILE_SCENE_CONFIG.heroSkillsRevealDuration,
          autoAlpha: 1,
          xPercent: 0,
        },
        MOBILE_SCENE_CONFIG.heroSkillsRevealAt,
      )
      .to(
        heroSkillsPanel,
        {
          duration: MOBILE_SCENE_CONFIG.heroSkillsExitDuration,
          autoAlpha: 0,
          xPercent: MOBILE_SCENE_CONFIG.heroSkillsExitXPercent,
        },
        MOBILE_SCENE_CONFIG.heroSkillsExitAt,
      )
      .to(
        heroExperiencePanel,
        {
          duration: MOBILE_SCENE_CONFIG.heroExperienceRevealDuration,
          autoAlpha: 1,
          xPercent: 0,
        },
        MOBILE_SCENE_CONFIG.heroExperienceRevealAt,
      )
      .to(
        heroExperiencePanel,
        {
          duration: MOBILE_SCENE_CONFIG.heroExperienceExitDuration,
          autoAlpha: 0,
          yPercent: MOBILE_SCENE_CONFIG.heroExperienceExitYPercent,
        },
        MOBILE_SCENE_CONFIG.heroExperienceExitAt,
      )
      .to(
        heroBackground,
        {
          duration: MOBILE_SCENE_CONFIG.heroZoomPhaseOneDuration,
          scale: MOBILE_SCENE_CONFIG.heroZoomPhaseOneScale,
          yPercent: MOBILE_SCENE_CONFIG.heroZoomPhaseOneShiftYPercent,
          transformOrigin: `${MOBILE_SCENE_CONFIG.heroZoomFocusX} ${MOBILE_SCENE_CONFIG.heroZoomFocusY}`,
        },
        MOBILE_SCENE_CONFIG.heroZoomPhaseOneAt,
      )
      .to(
        heroBackground,
        {
          duration: MOBILE_SCENE_CONFIG.heroZoomPhaseTwoDuration,
          scale: MOBILE_SCENE_CONFIG.heroZoomPhaseTwoScale,
          yPercent: MOBILE_SCENE_CONFIG.heroZoomPhaseTwoShiftYPercent,
          transformOrigin: `${MOBILE_SCENE_CONFIG.heroZoomFocusX} ${MOBILE_SCENE_CONFIG.heroZoomFocusY}`,
        },
        MOBILE_SCENE_CONFIG.heroZoomPhaseTwoAt,
      )
      .to(
        heroBackground,
        {
          duration: MOBILE_SCENE_CONFIG.heroZoomPhaseThreeDuration,
          scale: MOBILE_SCENE_CONFIG.heroZoomPhaseThreeScale,
          yPercent: MOBILE_SCENE_CONFIG.heroZoomPhaseThreeShiftYPercent,
          transformOrigin: `${MOBILE_SCENE_CONFIG.heroZoomFocusX} ${MOBILE_SCENE_CONFIG.heroZoomFocusY}`,
        },
        MOBILE_SCENE_CONFIG.heroZoomPhaseThreeAt,
      )
      .to(
        heroOverlay,
        {
          duration: MOBILE_SCENE_CONFIG.heroZoomPhaseOneDuration,
          opacity: 0.84,
        },
        MOBILE_SCENE_CONFIG.heroZoomPhaseOneAt,
      )
      .to(
        heroOverlay,
        {
          duration: MOBILE_SCENE_CONFIG.heroZoomPhaseTwoDuration,
          opacity: 0.7,
        },
        MOBILE_SCENE_CONFIG.heroZoomPhaseTwoAt,
      )
      .to(
        heroOverlay,
        {
          duration: MOBILE_SCENE_CONFIG.heroZoomPhaseThreeDuration,
          opacity: MOBILE_SCENE_CONFIG.heroOverlayZoomOpacity,
        },
        MOBILE_SCENE_CONFIG.heroZoomPhaseThreeAt,
      )
      .to(
        heroLayer,
        {
          duration: MOBILE_SCENE_CONFIG.heroExitDuration,
          opacity: MOBILE_SCENE_CONFIG.heroExitOpacity,
        },
        MOBILE_SCENE_CONFIG.heroExitAt,
      )
      .to(
        galaxyLayer,
        {
          duration: MOBILE_SCENE_CONFIG.galaxyRevealDuration,
          opacity: MOBILE_SCENE_CONFIG.galaxyEndOpacity,
        },
        MOBILE_SCENE_CONFIG.galaxyRevealAt,
      )
      .to(
        galaxyVideo,
        {
          duration: MOBILE_SCENE_CONFIG.galaxyRevealDuration,
          scale: MOBILE_SCENE_CONFIG.galaxyEndScale,
        },
        MOBILE_SCENE_CONFIG.galaxyRevealAt,
      )
      .to(
        galaxyOverlay,
        {
          duration: MOBILE_SCENE_CONFIG.galaxyRevealDuration,
          opacity: MOBILE_SCENE_CONFIG.galaxyOverlayEndOpacity,
        },
        MOBILE_SCENE_CONFIG.galaxyRevealAt,
      )
      .to(
        galaxyLayer,
        {
          duration: MOBILE_SCENE_CONFIG.galaxyExitDuration,
          autoAlpha: MOBILE_SCENE_CONFIG.galaxyExitOpacity,
          yPercent: MOBILE_SCENE_CONFIG.galaxyExitYPercent,
        },
        MOBILE_SCENE_CONFIG.galaxyExitAt,
      )
      .to(
        stackLayer,
        {
          duration: MOBILE_SCENE_CONFIG.stackRevealDuration,
          autoAlpha: MOBILE_SCENE_CONFIG.stackLayerEndOpacity,
          yPercent: MOBILE_SCENE_CONFIG.stackLayerEndYPercent,
        },
        MOBILE_SCENE_CONFIG.stackRevealAt,
      )
      .to(
        stackLayer,
        {
          duration: MOBILE_SCENE_CONFIG.stackExitDuration,
          autoAlpha: MOBILE_SCENE_CONFIG.stackExitOpacity,
          yPercent: MOBILE_SCENE_CONFIG.stackExitYPercent,
          scale: MOBILE_SCENE_CONFIG.stackExitScale,
        },
        MOBILE_SCENE_CONFIG.stackExitAt,
      )
      .to(
        endingLayer,
        {
          duration: MOBILE_SCENE_CONFIG.endingRevealDuration,
          autoAlpha: MOBILE_SCENE_CONFIG.endingLayerEndOpacity,
          yPercent: MOBILE_SCENE_CONFIG.endingLayerEndYPercent,
        },
        MOBILE_SCENE_CONFIG.endingRevealAt,
      )
      .to(
        endingVideo,
        {
          duration: MOBILE_SCENE_CONFIG.endingRevealDuration,
          scale: MOBILE_SCENE_CONFIG.endingVideoEndScale,
        },
        MOBILE_SCENE_CONFIG.endingRevealAt,
      )
      .to(
        endingOverlay,
        {
          duration: MOBILE_SCENE_CONFIG.endingRevealDuration,
          opacity: MOBILE_SCENE_CONFIG.endingOverlayEndOpacity,
        },
        MOBILE_SCENE_CONFIG.endingRevealAt,
      );

    if (profileParagraphs.length > 0) {
      profileParagraphs.forEach((paragraph, index) => {
        const paragraphStart =
          MOBILE_SCENE_CONFIG.profileSequenceStartAt + index * MOBILE_SCENE_CONFIG.profileParagraphStep;
        const paragraphOutAt =
          paragraphStart +
          MOBILE_SCENE_CONFIG.profileParagraphInDuration +
          MOBILE_SCENE_CONFIG.profileParagraphHoldDuration;

        mobileTimeline.to(
          paragraph,
          {
            duration: MOBILE_SCENE_CONFIG.profileParagraphInDuration,
            autoAlpha: 1,
            yPercent: 0,
            filter: "blur(0px)",
          },
          paragraphStart,
        );

        mobileTimeline.to(
          paragraph,
          {
            duration: MOBILE_SCENE_CONFIG.profileParagraphOutDuration,
            autoAlpha: 0,
            yPercent: -10,
            filter: "blur(8px)",
          },
          paragraphOutAt,
        );
      });
    }

    guideDismissButton.addEventListener("click", dismissMobileGuideModal);
    guideDismissForeverButton.addEventListener("click", dismissMobileGuideModalForever);
    overscrollDismissButton.addEventListener("click", dismissMobileOverscrollModal);
    endingVideo.addEventListener("ended", () => {
      runMobileEndingResetSequence().catch(() => {
        mobileEndingResetActive = false;
        mobileSetScrollLock(false);
      });
    });

    const blockMobileLockedScroll = (event) => {
      if (!mobileGuideModalOpen && !mobileOverscrollModalOpen && !mobileEndingResetActive) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("wheel", blockMobileLockedScroll, { passive: false, capture: true });
    window.addEventListener("touchmove", blockMobileLockedScroll, { passive: false, capture: true });

    window.addEventListener(
      "wheel",
      (event) => {
        if (mobileGuideModalOpen || mobileOverscrollModalOpen || mobileEndingResetActive) {
          return;
        }

        const now = window.performance.now();
        const delta = Math.abs(event.deltaY);

        if (now - mobileLastTouchTimestamp > EXCESSIVE_SCROLL_CONFIG.burstWindowMs) {
          mobileExcessiveScrollDelta = 0;
        }

        mobileExcessiveScrollDelta += delta;
        mobileLastTouchTimestamp = now;

        if (
          delta >= EXCESSIVE_SCROLL_CONFIG.singleDeltaThreshold ||
          mobileExcessiveScrollDelta >= EXCESSIVE_SCROLL_CONFIG.burstDeltaThreshold
        ) {
          openMobileOverscrollModal();
          return;
        }

        if (event.deltaY < -4) {
          maybeShowMobileUpscrollHint();
        }
      },
      { passive: true },
    );

    window.addEventListener(
      "touchstart",
      (event) => {
        const firstTouch = event.touches[0];

        if (!firstTouch) {
          return;
        }

        mobileTouchStartY = firstTouch.clientY;
      },
      { passive: true },
    );

    window.addEventListener(
      "touchmove",
      (event) => {
        if (mobileGuideModalOpen || mobileOverscrollModalOpen || mobileEndingResetActive) {
          return;
        }

        const firstTouch = event.touches[0];

        if (!firstTouch) {
          return;
        }

        const deltaY = mobileTouchStartY - firstTouch.clientY;
        const now = window.performance.now();
        const delta = Math.abs(deltaY);

        if (now - mobileLastTouchTimestamp > EXCESSIVE_SCROLL_CONFIG.burstWindowMs) {
          mobileExcessiveScrollDelta = 0;
        }

        mobileExcessiveScrollDelta += delta;
        mobileLastTouchTimestamp = now;

        if (
          delta >= EXCESSIVE_SCROLL_CONFIG.singleDeltaThreshold * 0.4 ||
          mobileExcessiveScrollDelta >= EXCESSIVE_SCROLL_CONFIG.burstDeltaThreshold * 0.55
        ) {
          openMobileOverscrollModal();
          return;
        }

        if (deltaY < -12) {
          maybeShowMobileUpscrollHint();
        }
      },
      { passive: true },
    );

    video.play().catch(() => {
      // Mobile autoplay can still be blocked depending on the browser context.
    });

    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });

    return;
  }

  applyIntroVideoSource(video.dataset.desktopSrc ?? introVideoPath);
  scene.dataset.initialized = "true";
  document.body.append(blackoutLayer);
  document.body.append(guideModal);
  document.body.append(overscrollModal);
  document.body.append(scrollToast);
  document.body.append(scrollControlButton);

  let galaxyPlaybackActive = false;
  let endingPlaybackActive = false;
  let endingResetActive = false;
  let sceneCurrentTime = 0;
  let toastHideTimer = 0;
  let lastUpscrollHintAt = 0;
  let lastEndingHintAt = 0;
  let guideModalOpen = true;
  let guideModalDismissedForever = false;
  let overscrollModalOpen = false;
  let excessiveScrollDelta = 0;
  let lastWheelTimestamp = 0;

  const playGalaxyVideo = () => {
    if (galaxyPlaybackActive) {
      return;
    }

    galaxyPlaybackActive = true;
    galaxyVideo.play().catch(() => {
      // Autoplay can still be blocked in some embedded contexts.
    });
  };

  const resetGalaxyVideo = () => {
    if (!galaxyPlaybackActive && galaxyVideo.currentTime === 0) {
      return;
    }

    galaxyPlaybackActive = false;
    galaxyVideo.pause();

    if (galaxyVideo.readyState >= 1) {
      galaxyVideo.currentTime = 0;
    }
  };

  const playEndingVideo = () => {
    if (endingPlaybackActive || endingResetActive) {
      return;
    }

    if (
      endingVideo.readyState >= 1 &&
      Number.isFinite(endingVideo.duration) &&
      endingVideo.currentTime >= Math.max(endingVideo.duration - 0.12, 0)
    ) {
      endingVideo.currentTime = 0;
    }

    endingPlaybackActive = true;
    endingVideo.play().catch(() => {
      // Autoplay can still be blocked in some embedded contexts.
    });
  };

  const resetEndingVideo = () => {
    if (!endingPlaybackActive && endingVideo.currentTime === 0) {
      return;
    }

    endingPlaybackActive = false;
    endingVideo.pause();

    if (endingVideo.readyState >= 1) {
      endingVideo.currentTime = 0;
    }
  };

  const animateTo = (target, vars) =>
    new Promise((resolve) => {
      gsap.to(target, {
        ...vars,
        onComplete: resolve,
      });
    });

  const setScrollLock = (isLocked) => {
    const overflowValue = isLocked ? "hidden" : "";

    document.documentElement.style.overflow = overflowValue;
    document.body.style.overflow = overflowValue;
  };

  const showScrollToast = (message) => {
    window.clearTimeout(toastHideTimer);
    scrollToast.textContent = message;
    gsap.killTweensOf(scrollToast);
    gsap.set(scrollToast, {
      y: 18,
      autoAlpha: 1,
    });
    gsap.to(scrollToast, {
      duration: 0.32,
      y: 0,
      autoAlpha: 1,
      ease: "power2.out",
    });

    toastHideTimer = window.setTimeout(() => {
      gsap.to(scrollToast, {
        duration: 0.32,
        y: 12,
        autoAlpha: 0,
        ease: "power2.in",
      });
    }, GUIDANCE_CONFIG.toastVisibleMs);
  };

  const dismissGuideModal = () => {
    if (!guideModalOpen) {
      return;
    }

    guideModalOpen = false;
    gsap.to(guideModal, {
      duration: 0.45,
      autoAlpha: 0,
      ease: "power2.out",
    });
  };

  const dismissGuideModalForever = () => {
    guideModalDismissedForever = true;

    try {
      window.localStorage.setItem(GUIDE_MODAL_STORAGE_KEY, "true");
    } catch {
      // Ignore storage failures and keep the session functional.
    }

    dismissGuideModal();
  };

  const openOverscrollModal = () => {
    if (overscrollModalOpen || endingResetActive) {
      return;
    }

    overscrollModalOpen = true;
    window.clearTimeout(toastHideTimer);
    gsap.killTweensOf(scrollToast);
    gsap.to(scrollToast, {
      duration: 0.2,
      autoAlpha: 0,
      y: 12,
      ease: "power2.out",
    });
    setScrollLock(true);
    gsap.to(overscrollModal, {
      duration: 0.22,
      autoAlpha: 1,
      ease: "power2.out",
    });
  };

  const dismissOverscrollModal = () => {
    if (!overscrollModalOpen) {
      return;
    }

    overscrollModalOpen = false;
    excessiveScrollDelta = 0;
    lastWheelTimestamp = 0;
    setScrollLock(false);
    gsap.to(overscrollModal, {
      duration: 0.32,
      autoAlpha: 0,
      ease: "power2.out",
    });
  };

  const nudgeScrollDown = () => {
    if (guideModalOpen || overscrollModalOpen || endingResetActive) {
      return;
    }

    const scrollStep = Math.max(
      SCROLL_CONTROL_CONFIG.clickStepPx,
      window.innerHeight * SCROLL_CONTROL_CONFIG.minViewportRatio,
    );

    window.scrollTo({
      top: window.scrollY + scrollStep,
      behavior: "smooth",
    });
  };

  const isInGuidedScrollWindow = (time) =>
    time <= SCENE_CONFIG.shadowReleaseAt ||
    (time >= SCENE_CONFIG.heroZoomPreludeAt && time <= SCENE_CONFIG.heroExitAt) ||
    (time >= SCENE_CONFIG.galaxyRevealAt && time <= SCENE_CONFIG.galaxyExitAt);

  const maybeShowUpscrollHint = () => {
    const now = window.performance.now();

    if (now - lastUpscrollHintAt < GUIDANCE_CONFIG.toastCooldownMs) {
      return;
    }

    lastUpscrollHintAt = now;
    showScrollToast("Continue a scroller vers le bas. Ne t inquiete pas, c est un site immersif.");
  };

  const maybeShowEndingHint = () => {
    const now = window.performance.now();

    if (now - lastEndingHintAt < GUIDANCE_CONFIG.toastCooldownMs) {
      return;
    }

    lastEndingHintAt = now;
    showScrollToast("Ceci est la fin. Ne scrolle plus, attends simplement la fin de l animation.");
  };

  const runEndingResetSequence = async () => {
    if (endingResetActive) {
      return;
    }

    endingResetActive = true;
    endingPlaybackActive = false;
    endingVideo.pause();

    gsap.set(blackoutLayer, {
      autoAlpha: 0,
    });

    for (const opacity of RESET_SEQUENCE.blackoutSteps) {
      await animateTo(blackoutLayer, {
        duration: RESET_SEQUENCE.blackoutStepDuration,
        autoAlpha: opacity,
        ease: "sine.inOut",
      });

      if (opacity < 1) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, RESET_SEQUENCE.blackoutGapDuration * 1000);
        });
      }
    }

    await smoothScrollToTop(RESET_SEQUENCE.autoScrollDurationMs);
    resetGalaxyVideo();
    resetEndingVideo();

    setScrollLock(true);
    video.play().catch(() => {
      // Autoplay can still be blocked in some embedded contexts.
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, RESET_SEQUENCE.blackoutHoldAtTopDuration * 1000);
    });

    for (const opacity of RESET_SEQUENCE.blackoutReleaseSteps) {
      await animateTo(blackoutLayer, {
        duration: RESET_SEQUENCE.blackoutReleaseStepDuration,
        autoAlpha: opacity,
        ease: "sine.out",
      });

      if (opacity > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, RESET_SEQUENCE.blackoutReleaseGapDuration * 1000);
        });
      }
    }

    endingResetActive = false;
    setScrollLock(false);
    ScrollTrigger.refresh();
  };

  gsap.registerPlugin(ScrollTrigger);
  gsap.set([videoShell, video], {
    transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
  });

  if (heroLayer) {
    gsap.set(heroLayer, { opacity: 0 });
  }

  if (heroSkillsPanel) {
    gsap.set(heroSkillsPanel, { autoAlpha: 0, yPercent: SCENE_CONFIG.skillsInitialYPercent });
  }

  if (heroExperiencePanel) {
    gsap.set(heroExperiencePanel, {
      autoAlpha: 0,
      yPercent: SCENE_CONFIG.experienceInitialYPercent,
    });
  }

  if (heroBackground) {
    gsap.set(heroBackground, {
      scale: SCENE_CONFIG.heroBackgroundStartScale,
      xPercent: 0,
      yPercent: 0,
      transformOrigin: `${SCENE_CONFIG.heroZoomFocusX} ${SCENE_CONFIG.heroZoomFocusY}`,
    });
  }

  if (heroOverlay) {
    gsap.set(heroOverlay, { opacity: 1 });
  }

  gsap.set(galaxyLayer, {
    opacity: SCENE_CONFIG.galaxyStartOpacity,
    yPercent: 0,
    scale: 1,
  });

  gsap.set(galaxyVideo, {
    scale: SCENE_CONFIG.galaxyStartScale,
  });

  gsap.set(galaxyOverlay, {
    opacity: SCENE_CONFIG.galaxyOverlayStartOpacity,
  });

  if (profileParagraphs.length > 0) {
    gsap.set(profileParagraphs, {
      autoAlpha: 0,
      yPercent: 18,
      filter: "blur(12px)",
    });
  }

  gsap.set(stackLayer, {
    autoAlpha: SCENE_CONFIG.stackLayerStartOpacity,
    yPercent: SCENE_CONFIG.stackLayerStartYPercent,
  });

  gsap.set(endingLayer, {
    autoAlpha: SCENE_CONFIG.endingLayerStartOpacity,
    yPercent: SCENE_CONFIG.endingLayerStartYPercent,
  });

  gsap.set(endingVideo, {
    scale: SCENE_CONFIG.endingVideoStartScale,
  });

  gsap.set(endingOverlay, {
    opacity: SCENE_CONFIG.endingOverlayStartOpacity,
  });

  resetGalaxyVideo();
  resetEndingVideo();

  gsap.set(shadowLayer, {
    opacity: 0,
    "--shadow-hole-size": SCENE_CONFIG.shadowIntroHoleSize,
  });

  gsap.set(blackoutLayer, {
    autoAlpha: 0,
  });

  gsap.set(guideModal, {
    autoAlpha: 1,
  });

  gsap.set(overscrollModal, {
    autoAlpha: 0,
  });

  gsap.set(scrollToast, {
    autoAlpha: 0,
    y: 12,
  });

  gsap.set(scrollControlButton, {
    autoAlpha: 1,
    x: 0,
  });

  try {
    guideModalDismissedForever = window.localStorage.getItem(GUIDE_MODAL_STORAGE_KEY) === "true";
  } catch {
    guideModalDismissedForever = false;
  }

  if (guideModalDismissedForever) {
    guideModalOpen = false;
    gsap.set(guideModal, {
      autoAlpha: 0,
    });
  }

  // ScrollTrigger pins the viewport while the zoom and edge vignette evolve together.
  const introTimeline = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: scene,
      start: "top top",
      end: `+=${SCENE_CONFIG.scrollDistance}`,
      pin: viewport,
      scrub: true,
      anticipatePin: 1,
      onUpdate: (self) => {
        const currentTime = self.animation?.time() ?? 0;
        sceneCurrentTime = currentTime;

        if (!endingResetActive) {
          if (
            currentTime >= SCENE_CONFIG.galaxyPlaybackAt &&
            currentTime <= SCENE_CONFIG.galaxyPlaybackEndAt
          ) {
            playGalaxyVideo();
          } else {
            resetGalaxyVideo();
          }

          if (currentTime >= SCENE_CONFIG.endingPlaybackAt) {
            playEndingVideo();
          } else {
            resetEndingVideo();
          }
          return;
        }

        resetGalaxyVideo();
        resetEndingVideo();
      },
    },
  });

  introTimeline
    .fromTo(
      videoShell,
      {
        scale: SCENE_CONFIG.frameStartScale,
        xPercent: 0,
        yPercent: 0,
        borderRadius: SCENE_CONFIG.radiusStart,
        transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
      },
      {
        duration: 0.5,
        scale: SCENE_CONFIG.frameMidScale,
        xPercent: SCENE_CONFIG.frameShiftXPercent,
        yPercent: SCENE_CONFIG.frameMidShiftYPercent,
        borderRadius: SCENE_CONFIG.radiusEnd,
        transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
      },
      0,
    )
    .to(
      videoShell,
      {
        duration: 0.5,
        scale: SCENE_CONFIG.frameEndScale,
        xPercent: SCENE_CONFIG.frameShiftXPercent,
        yPercent: SCENE_CONFIG.frameEndShiftYPercent,
        borderRadius: SCENE_CONFIG.radiusEnd,
        transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
      },
      0.5,
    )
    .fromTo(
      video,
      {
        scale: SCENE_CONFIG.videoStartScale,
        xPercent: 0,
        yPercent: 0,
        transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
      },
      {
        duration: 0.5,
        scale: SCENE_CONFIG.videoMidScale,
        xPercent: SCENE_CONFIG.videoShiftXPercent,
        yPercent: SCENE_CONFIG.videoMidShiftYPercent,
        transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
      },
      0,
    )
    .to(
      video,
      {
        duration: 0.5,
        scale: SCENE_CONFIG.videoEndScale,
        xPercent: SCENE_CONFIG.videoShiftXPercent,
        yPercent: SCENE_CONFIG.videoEndShiftYPercent,
        transformOrigin: `${SCENE_CONFIG.focusOriginX} ${SCENE_CONFIG.focusOriginY}`,
      },
      0.5,
    )
    .fromTo(
      shadowLayer,
      {
        opacity: 0,
        "--shadow-hole-size": SCENE_CONFIG.shadowIntroHoleSize,
      },
      {
        duration: SCENE_CONFIG.shadowIntroAt,
        opacity: SCENE_CONFIG.shadowIntroOpacity,
        "--shadow-hole-size": SCENE_CONFIG.shadowMidHoleSize,
      },
      0,
    )
    .to(
      shadowLayer,
      {
        duration: SCENE_CONFIG.shadowTransitionDuration,
        opacity: SCENE_CONFIG.shadowTransitionOpacity,
        "--shadow-hole-size": SCENE_CONFIG.shadowTransitionHoleSize,
      },
      SCENE_CONFIG.shadowTransitionAt,
    )
    .to(
      videoShell,
      {
        duration: SCENE_CONFIG.videoFadeDuration,
        opacity: SCENE_CONFIG.videoFadeEndOpacity,
      },
      SCENE_CONFIG.videoFadeAt,
    )
    .to(
      shadowLayer,
      {
        duration: SCENE_CONFIG.shadowDilateDuration,
        opacity: SCENE_CONFIG.shadowDilateOpacity,
        "--shadow-hole-size": SCENE_CONFIG.shadowDilateHoleSize,
      },
      SCENE_CONFIG.shadowDilateAt,
    )
    .to(
      shadowLayer,
      {
        duration: SCENE_CONFIG.shadowReleaseDuration,
        opacity: SCENE_CONFIG.shadowReleaseOpacity,
        "--shadow-hole-size": SCENE_CONFIG.shadowReleaseHoleSize,
      },
      SCENE_CONFIG.shadowReleaseAt,
    );

  if (heroLayer) {
    introTimeline.to(
      heroLayer,
      {
        duration: SCENE_CONFIG.heroRevealDuration,
        opacity: 1,
      },
      SCENE_CONFIG.heroRevealAt,
    );
  }

  if (heroNameZone) {
    introTimeline.to(
      heroNameZone,
      {
        duration: SCENE_CONFIG.heroMotionDuration,
        y: SCENE_CONFIG.heroNameDropY,
        autoAlpha: 0,
      },
      SCENE_CONFIG.heroMotionAt,
    );
  }

  if (heroWordZone) {
    introTimeline.to(
      heroWordZone,
      {
        duration: SCENE_CONFIG.heroMotionDuration,
        y: SCENE_CONFIG.heroWordDropY,
        autoAlpha: 0,
      },
      SCENE_CONFIG.heroMotionAt,
    );
  }

  if (heroSkillsPanel) {
    introTimeline.to(
      heroSkillsPanel,
      {
        duration: SCENE_CONFIG.skillsRevealDuration,
        autoAlpha: 1,
        yPercent: 0,
      },
      SCENE_CONFIG.skillsRevealAt,
    );
  }

  if (heroSkillsPanel) {
    introTimeline.to(
      heroSkillsPanel,
      {
        duration: SCENE_CONFIG.experienceRevealDuration,
        autoAlpha: 0,
        yPercent: SCENE_CONFIG.skillsExitYPercent,
      },
      SCENE_CONFIG.experienceRevealAt,
    );
  }

  if (heroExperiencePanel) {
    introTimeline.to(
      heroExperiencePanel,
      {
        duration: SCENE_CONFIG.experienceRevealDuration,
        autoAlpha: 1,
        yPercent: 0,
      },
      SCENE_CONFIG.experienceRevealAt,
    );
  }

  if (heroContent) {
    introTimeline.to(
      heroContent,
      {
        duration: SCENE_CONFIG.heroContentFadeDuration,
        autoAlpha: 0,
      },
      SCENE_CONFIG.heroContentFadeAt,
    );
  }

  if (heroBackground) {
    introTimeline.to(
      heroBackground,
      {
        duration: SCENE_CONFIG.heroZoomPreludeDuration,
        scale: SCENE_CONFIG.heroBackgroundPreludeScale,
        xPercent: SCENE_CONFIG.heroBackgroundPreludeShiftXPercent,
        yPercent: SCENE_CONFIG.heroBackgroundPreludeShiftYPercent,
        transformOrigin: `${SCENE_CONFIG.heroZoomFocusX} ${SCENE_CONFIG.heroZoomFocusY}`,
      },
      SCENE_CONFIG.heroZoomPreludeAt,
    );

    introTimeline.to(
      heroBackground,
      {
        duration: SCENE_CONFIG.heroZoomPhaseTwoDuration,
        scale: SCENE_CONFIG.heroBackgroundPhaseTwoScale,
        xPercent: SCENE_CONFIG.heroBackgroundPhaseTwoShiftXPercent,
        yPercent: SCENE_CONFIG.heroBackgroundPhaseTwoShiftYPercent,
        transformOrigin: `${SCENE_CONFIG.heroZoomFocusX} ${SCENE_CONFIG.heroZoomFocusY}`,
      },
      SCENE_CONFIG.heroZoomPhaseTwoAt,
    );

    introTimeline.to(
      heroBackground,
      {
        duration: SCENE_CONFIG.heroZoomPhaseThreeDuration,
        scale: SCENE_CONFIG.heroBackgroundPhaseThreeScale,
        xPercent: SCENE_CONFIG.heroBackgroundPhaseThreeShiftXPercent,
        yPercent: SCENE_CONFIG.heroBackgroundPhaseThreeShiftYPercent,
        transformOrigin: `${SCENE_CONFIG.heroZoomFocusX} ${SCENE_CONFIG.heroZoomFocusY}`,
      },
      SCENE_CONFIG.heroZoomPhaseThreeAt,
    );

    introTimeline.to(
      heroBackground,
      {
        duration: SCENE_CONFIG.heroZoomPhaseFourDuration,
        scale: SCENE_CONFIG.heroBackgroundEndScale,
        xPercent: SCENE_CONFIG.heroBackgroundShiftXPercent,
        yPercent: SCENE_CONFIG.heroBackgroundShiftYPercent,
        transformOrigin: `${SCENE_CONFIG.heroZoomFocusX} ${SCENE_CONFIG.heroZoomFocusY}`,
      },
      SCENE_CONFIG.heroZoomPhaseFourAt,
    );
  }

  if (heroOverlay) {
    introTimeline.to(
      heroOverlay,
      {
        duration: SCENE_CONFIG.heroZoomPreludeDuration,
        opacity: SCENE_CONFIG.heroOverlayPreludeOpacity,
      },
      SCENE_CONFIG.heroZoomPreludeAt,
    );

    introTimeline.to(
      heroOverlay,
      {
        duration: SCENE_CONFIG.heroZoomPhaseTwoDuration,
        opacity: SCENE_CONFIG.heroOverlayPhaseTwoOpacity,
      },
      SCENE_CONFIG.heroZoomPhaseTwoAt,
    );

    introTimeline.to(
      heroOverlay,
      {
        duration: SCENE_CONFIG.heroZoomPhaseThreeDuration,
        opacity: SCENE_CONFIG.heroOverlayPhaseThreeOpacity,
      },
      SCENE_CONFIG.heroZoomPhaseThreeAt,
    );

    introTimeline.to(
      heroOverlay,
      {
        duration: SCENE_CONFIG.heroZoomPhaseFourDuration,
        opacity: SCENE_CONFIG.heroOverlayZoomOpacity,
      },
      SCENE_CONFIG.heroZoomPhaseFourAt,
    );
  }

  if (heroLayer) {
    introTimeline.to(
      heroLayer,
      {
        duration: SCENE_CONFIG.heroExitDuration,
        opacity: SCENE_CONFIG.heroExitOpacity,
      },
      SCENE_CONFIG.heroExitAt,
    );
  }

  introTimeline.to(
    galaxyLayer,
    {
      duration: SCENE_CONFIG.galaxyRevealDuration,
      opacity: SCENE_CONFIG.galaxyEndOpacity,
    },
    SCENE_CONFIG.galaxyRevealAt,
  );

  introTimeline.to(
    galaxyVideo,
    {
      duration: SCENE_CONFIG.galaxyRevealDuration,
      scale: SCENE_CONFIG.galaxyEndScale,
    },
    SCENE_CONFIG.galaxyRevealAt,
  );

  introTimeline.to(
    galaxyOverlay,
    {
      duration: SCENE_CONFIG.galaxyRevealDuration,
      opacity: SCENE_CONFIG.galaxyOverlayEndOpacity,
    },
    SCENE_CONFIG.galaxyRevealAt,
  );

  if (profileParagraphs.length > 0) {
    profileParagraphs.forEach((paragraph, index) => {
      const paragraphStart = SCENE_CONFIG.profileSequenceStartAt + index * SCENE_CONFIG.profileParagraphStep;
      const paragraphOutAt =
        paragraphStart +
        SCENE_CONFIG.profileParagraphInDuration +
        SCENE_CONFIG.profileParagraphHoldDuration;

      introTimeline.to(
        paragraph,
        {
          duration: SCENE_CONFIG.profileParagraphInDuration,
          autoAlpha: 1,
          yPercent: 0,
          filter: "blur(0px)",
        },
        paragraphStart,
      );

      introTimeline.to(
        paragraph,
        {
          duration: SCENE_CONFIG.profileParagraphOutDuration,
          autoAlpha: 0,
          yPercent: -18,
          filter: "blur(10px)",
        },
        paragraphOutAt,
      );
    });
  }

  introTimeline.to(
    galaxyLayer,
    {
      duration: SCENE_CONFIG.galaxyExitDuration,
      yPercent: SCENE_CONFIG.galaxyExitYPercent,
      opacity: SCENE_CONFIG.galaxyExitOpacity,
      scale: SCENE_CONFIG.galaxyExitScale,
    },
    SCENE_CONFIG.galaxyExitAt,
  );

  introTimeline.to(
    stackLayer,
    {
      duration: SCENE_CONFIG.stackRevealDuration,
      autoAlpha: SCENE_CONFIG.stackLayerEndOpacity,
      yPercent: SCENE_CONFIG.stackLayerEndYPercent,
    },
    SCENE_CONFIG.stackRevealAt,
  );

  introTimeline.to(
    stackLayer,
    {
      duration: SCENE_CONFIG.stackExitDuration,
      autoAlpha: SCENE_CONFIG.stackExitOpacity,
      yPercent: SCENE_CONFIG.stackExitYPercent,
      scale: SCENE_CONFIG.stackExitScale,
    },
    SCENE_CONFIG.stackExitAt,
  );

  introTimeline.to(
    endingLayer,
    {
      duration: SCENE_CONFIG.endingRevealDuration,
      autoAlpha: SCENE_CONFIG.endingLayerEndOpacity,
      yPercent: SCENE_CONFIG.endingLayerEndYPercent,
    },
    SCENE_CONFIG.endingRevealAt,
  );

  introTimeline.to(
    endingVideo,
    {
      duration: SCENE_CONFIG.endingRevealDuration,
      scale: SCENE_CONFIG.endingVideoEndScale,
    },
    SCENE_CONFIG.endingRevealAt,
  );

  introTimeline.to(
    endingOverlay,
    {
      duration: SCENE_CONFIG.endingRevealDuration,
      opacity: SCENE_CONFIG.endingOverlayEndOpacity,
    },
    SCENE_CONFIG.endingRevealAt,
  );

  const refreshScroll = () => ScrollTrigger.refresh();

  if (video.readyState < 1) {
    video.addEventListener("loadedmetadata", refreshScroll, { once: true });
  }

  if (galaxyVideo.readyState < 1) {
    galaxyVideo.addEventListener("loadedmetadata", refreshScroll, { once: true });
  }

  if (endingVideo.readyState < 1) {
    endingVideo.addEventListener("loadedmetadata", refreshScroll, { once: true });
  }

  endingVideo.addEventListener("ended", () => {
    runEndingResetSequence().catch(() => {
      endingResetActive = false;
      setScrollLock(false);
    });
  });

  guideDismissButton.addEventListener("click", dismissGuideModal);
  guideDismissForeverButton.addEventListener("click", dismissGuideModalForever);
  overscrollDismissButton.addEventListener("click", dismissOverscrollModal);
  scrollControlButton.addEventListener("click", nudgeScrollDown);

  const blockLockedScroll = (event) => {
    if (!overscrollModalOpen) {
      return;
    }

    event.preventDefault();
  };

  const blockLockedKeyboardScroll = (event) => {
    if (!overscrollModalOpen) {
      return;
    }

    if (
      [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
        "Spacebar",
      ].includes(event.key)
    ) {
      event.preventDefault();
    }
  };

  window.addEventListener("wheel", blockLockedScroll, { passive: false, capture: true });
  window.addEventListener("touchmove", blockLockedScroll, { passive: false, capture: true });
  window.addEventListener("keydown", blockLockedKeyboardScroll, true);

  window.addEventListener(
    "wheel",
    (event) => {
      if (guideModalOpen) {
        dismissGuideModal();
        return;
      }

      if (endingResetActive || overscrollModalOpen) {
        return;
      }

      const now = window.performance.now();
      const delta = Math.abs(event.deltaY);

      if (now - lastWheelTimestamp > EXCESSIVE_SCROLL_CONFIG.burstWindowMs) {
        excessiveScrollDelta = 0;
      }

      excessiveScrollDelta += delta;
      lastWheelTimestamp = now;

      if (
        delta >= EXCESSIVE_SCROLL_CONFIG.singleDeltaThreshold ||
        excessiveScrollDelta >= EXCESSIVE_SCROLL_CONFIG.burstDeltaThreshold
      ) {
        openOverscrollModal();
        return;
      }

      if (event.deltaY < -4 && isInGuidedScrollWindow(sceneCurrentTime)) {
        maybeShowUpscrollHint();
      }

      if (event.deltaY > 4 && sceneCurrentTime >= SCENE_CONFIG.endingRevealAt) {
        maybeShowEndingHint();
      }
    },
    { passive: true },
  );

  window.addEventListener("keydown", (event) => {
    if (guideModalOpen && ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
      dismissGuideModal();
      return;
    }

    if (endingResetActive || overscrollModalOpen) {
      return;
    }

    if (event.key === "ArrowUp" && isInGuidedScrollWindow(sceneCurrentTime)) {
      maybeShowUpscrollHint();
    }

    if (event.key === "ArrowDown" && sceneCurrentTime >= SCENE_CONFIG.endingRevealAt) {
      maybeShowEndingHint();
    }
  });

  video.play().catch(() => {
    // Autoplay can still be blocked in some embedded contexts.
  });

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });
}

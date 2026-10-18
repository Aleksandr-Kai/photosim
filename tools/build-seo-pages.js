#!/usr/bin/env node
// Generates the static SEO pages under docs/ (one per lens, EN + RU, plus
// "all lenses" hub pages) and rewrites docs/sitemap.xml.
//
//   node tools/build-seo-pages.js
//
// The lens/sensor data is read straight out of script.js and the depth of
// field maths mirrors computeDOF() there (circle of confusion = sensor
// diagonal / 1500), so the tables always agree with the calculator.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const SITE = "https://aleksandr-kai.github.io/photosim";
const APK =
	"https://github.com/Aleksandr-Kai/photosim/releases/download/v1.0.0/PhotoSim.apk";

// ---------- data ----------
const src = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
function grab(name) {
	const i = src.indexOf("var " + name + " = [");
	let d = 0,
		j = src.indexOf("[", i);
	const start = j;
	for (; j < src.length; j++) {
		if (src[j] === "[") d++;
		else if (src[j] === "]" && !--d) break;
	}
	return eval(src.slice(start, j + 1));
}
const SENSORS = grab("SENSORS");
const LENSES = grab("LENSES").filter((l) => l.minF && l.group);

const sensorOf = (l) =>
	SENSORS.find((s) => s.id === (l.sensorId || "ff")) || SENSORS[0];
const sensorLabel = (s) => s.name.split(" — ")[0];
const diag = (s) => Math.sqrt(s.w * s.w + s.h * s.h);

function dof(fMM, N, sM, sensor) {
	const c = diag(sensor) / 1500;
	const s = sM * 1000;
	const H = fMM + (fMM * fMM) / (N * c);
	const near = (H * s) / (H + (s - fMM));
	const far = s >= H ? Infinity : (H * s) / (H - (s - fMM));
	return { H: H / 1000, near: near / 1000, far: far / 1000 };
}
const widestAt = (l, f) => {
	if (l.minF === l.maxF) return l.wMin;
	const t = Math.min(1, Math.max(0, (f - l.minF) / (l.maxF - l.minF)));
	return l.wMin + (l.wMax - l.wMin) * t;
};
const round1 = (x) => Math.round(x * 10) / 10;
const fmtM = (x) =>
	!isFinite(x) ? "∞" : x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.round(x));
const esc = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- naming ----------
function brandOf(l) {
	if (/^M\.Zuiko/.test(l.name)) return "Olympus";
	for (const b of ["Canon", "Nikon", "Sony", "Fujifilm"])
		if (l.group.startsWith(b)) return b;
	return "";
}
function fullName(l) {
	const b = brandOf(l);
	return b && !l.name.startsWith(b) ? b + " " + l.name : l.name;
}
const isZoom = (l) => l.minF !== l.maxF;

const STOPS = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32];
const FOCAL_PICK = [14, 16, 18, 20, 24, 28, 35, 50, 70, 85, 100, 135, 200, 300, 400];
function focalsFor(l) {
	if (!isZoom(l)) return [l.minF];
	const target = Math.sqrt(l.minF * l.maxF);
	const mid = FOCAL_PICK.filter((f) => f > l.minF && f < l.maxF).sort(
		(a, b) => Math.abs(Math.log(a / target)) - Math.abs(Math.log(b / target)),
	)[0];
	return [...new Set([l.minF, mid, l.maxF].filter(Boolean))].sort((a, b) => a - b);
}
function aperturesFor(l, f) {
	const w = round1(widestAt(l, f));
	const list = STOPS.filter((n) => n > w + 0.05 && n <= l.narrow + 0.05);
	return [w, ...list];
}
const DISTANCES = [1, 2, 3, 5, 10];

// ---------- shared css / chrome ----------
const indexHtml = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
const BASE_CSS = indexHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
const EXTRA_CSS = `
.lang-switch a.lang-tab{ text-decoration:none; display:inline-block; }
article{ max-width:56rem; margin:0 auto; }
article h2{ font-size:1.4rem; margin:2.2rem 0 .8rem; }
article h3{ font-size:1.1rem; margin:1.4rem 0 .5rem; color:var(--text); }
article p, article li{ color:var(--text-dim); line-height:1.7; }
article ul, article ol{ padding-left:1.3rem; }
.crumbs{ max-width:56rem; margin:0 auto 1rem; padding-top:2.6rem; font-size:.85rem; color:var(--text-dim); }
.crumbs a{ color:var(--text-dim); }
.hero-simple{ max-width:56rem; margin:0 auto 1.5rem; }
.hero-simple h1{ font-size:1.9rem; line-height:1.25; margin:.2rem 0 .6rem; }
.hero-simple p{ color:var(--text-dim); line-height:1.65; margin:0 0 .6rem; }
.page-embed{ height:1280px; margin-bottom:1.5rem; }
.table-wrap{ overflow-x:auto; margin-bottom:1rem; }
table.dof{ width:100%; border-collapse:collapse; font-size:.85rem; background:var(--surface); border:1px solid var(--border); border-radius:.5rem; }
table.dof th, table.dof td{ padding:.5rem .7rem; border-bottom:1px solid var(--border); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
table.dof th:first-child, table.dof td:first-child{ text-align:left; position:sticky; left:0; background:var(--surface); }
table.dof thead th{ color:var(--text); font-weight:600; }
table.dof td{ color:var(--text-dim); }
.facts li strong{ color:var(--text); }
details{ background:var(--surface); border:1px solid var(--border); border-radius:.75rem; padding:.8rem 1rem; margin-bottom:.6rem; }
details summary{ cursor:pointer; font-weight:600; color:var(--text); }
details p{ margin:.6rem 0 0; }
.chips{ list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:.5rem; }
.chips a{ display:inline-block; padding:.4rem .75rem; border:1px solid var(--border); border-radius:999px; background:var(--surface); color:var(--text); text-decoration:none; font-size:.85rem; }
.chips a:hover{ border-color:var(--accent); }
.cta-row{ margin:1rem 0 1.5rem; }
`;

const T = {
	en: {
		htmlLang: "en",
		home: "PhotoSim",
		all: "All lenses",
		langSel: "Language",
		calc: "Depth of field calculator",
		download: "Download for Android (APK)",
		meta: "v1.0.0 · Android 6.0+ · works offline",
		factsH: "Key numbers",
		tableH: "Depth of field table",
		hyperH: "Hyperfocal distance",
		faqH: "FAQ",
		relatedH: "Other lenses",
		browse: "Browse all lenses",
		unitNote:
			"Distances are measured from the sensor plane. Each cell shows the near and far limit of acceptable sharpness in metres (∞ = to infinity). Circle of confusion = sensor diagonal / 1500.",
		colAperture: "Aperture",
		colH: "Hyperfocal",
		author: "Made by",
		onTg: "on Telegram",
		source: "Source on GitHub",
	},
	ru: {
		htmlLang: "ru",
		home: "PhotoSim",
		all: "Все объективы",
		langSel: "Выбор языка",
		calc: "Калькулятор ГРИП",
		download: "Скачать для Android (APK)",
		meta: "v1.0.0 · Android 6.0+ · работает офлайн",
		factsH: "Ключевые цифры",
		tableH: "Таблица глубины резкости (ГРИП)",
		hyperH: "Гиперфокальное расстояние",
		faqH: "Частые вопросы",
		relatedH: "Другие объективы",
		browse: "Все объективы",
		unitNote:
			"Расстояния отсчитываются от плоскости матрицы. В каждой ячейке — ближняя и дальняя границы приемлемой резкости в метрах (∞ — до бесконечности). Кружок нерезкости = диагональ матрицы / 1500.",
		colAperture: "Диафрагма",
		colH: "Гиперфокальное",
		author: "Автор",
		onTg: "в Telegram",
		source: "Исходный код на GitHub",
	},
};

function langSwitch(lang, enHref, ruHref) {
	return `<div class="lang-switch" aria-label="${T[lang].langSel}">
	<a class="lang-tab${lang === "en" ? " is-active" : ""}" href="${enHref}" hreflang="en" lang="en"${lang === "en" ? ' aria-current="page"' : ""}>EN</a>
	<a class="lang-tab${lang === "ru" ? " is-active" : ""}" href="${ruHref}" hreflang="ru" lang="ru"${lang === "ru" ? ' aria-current="page"' : ""}>RU</a>
</div>`;
}

function head({ lang, title, desc, canonical, altEn, altRu, root, jsonld }) {
	return `<!doctype html>
<html lang="${T[lang].htmlLang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${canonical}" />
<link rel="alternate" hreflang="en" href="${altEn}" />
<link rel="alternate" hreflang="ru" href="${altRu}" />
<link rel="alternate" hreflang="x-default" href="${altEn}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="${lang === "ru" ? "ru_RU" : "en_US"}" />
<meta property="og:site_name" content="PhotoSim" />
<meta property="og:url" content="${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/assets/app-preview.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" href="${root}assets/favicon-64.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
<style>${BASE_CSS}${EXTRA_CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<div class="wrap">`;
}

function foot(lang) {
	const t = T[lang];
	return `<footer>
<span>${t.author} <a href="https://t.me/aleksandr_kai" target="_blank" rel="noopener noreferrer">@aleksandr_kai</a> ${t.onTg}</span>
<a href="https://github.com/Aleksandr-Kai/photosim" target="_blank" rel="noopener noreferrer">${t.source}</a>
</footer>
</div>
<script>(function(){var s=!1;try{"#nocount"===location.hash&&localStorage.setItem("no-count","1");"#count"===location.hash&&localStorage.removeItem("no-count");s="1"===localStorage.getItem("no-count")}catch(e){}if(s||/^(localhost|127\\.0\\.0\\.1|)$/.test(location.hostname))return;var g=document.createElement("script");g.async=!0;g.src="https://gc.zgo.at/count.js";g.setAttribute("data-goatcounter","https://aleksandr-kai-photosim.goatcounter.com/count");document.head.appendChild(g)})();</script>
</body>
</html>
`;
}

// ---------- URLs ----------
const lensUrl = (l, lang) => `${SITE}${lang === "ru" ? "/ru" : ""}/lenses/${l.id}/`;
const hubUrl = (lang) => `${SITE}${lang === "ru" ? "/ru" : ""}/lenses/`;
const homeUrl = (lang) => `${SITE}${lang === "ru" ? "/ru/" : "/"}`;

// ---------- lens page ----------
function lensPage(l, lang) {
	const t = T[lang];
	const name = fullName(l);
	const sensor = sensorOf(l);
	const crop = 43.27 / diag(sensor);
	const focals = focalsFor(l);
	const fMid = focals[Math.floor(focals.length / 2)];
	const wMid = round1(widestAt(l, fMid));
	const ref = dof(fMid, wMid, 3, sensor);
	const total3 = isFinite(ref.far) ? Math.round((ref.far - ref.near) * 100) : null;
	const nH = Math.min(8, l.narrow);
	const hyp = dof(fMid, nH, 10, sensor).H;
	const zoom = isZoom(l);
	const focalTxt = zoom ? `${l.minF}–${l.maxF}` : `${l.minF}`;
	const apTxt = l.wMin === l.wMax ? `f/${l.wMin}` : `f/${l.wMin}–${l.wMax}`;
	const root = lang === "ru" ? "../../../" : "../../";
	const equiv =
		sensor.id !== "ff"
			? lang === "ru"
				? ` (эквивалент ${Math.round(fMid * crop)} мм на полном кадре, кроп-фактор ${crop.toFixed(2)}×)`
				: ` (about ${Math.round(fMid * crop)}mm full-frame equivalent, ${crop.toFixed(2)}× crop)`
			: "";

	const title =
		lang === "ru"
			? `${name}: калькулятор ГРИП и таблица глубины резкости | PhotoSim`
			: `${name} Depth of Field Calculator & DoF Table | PhotoSim`;
	const desc =
		lang === "ru"
			? `Калькулятор ГРИП для ${name}: ближняя и дальняя границы резкости, гиперфокальное расстояние и глубина резкости при каждой диафрагме и расстоянии съёмки.`
			: `Depth of field calculator and DoF table for the ${name}: near and far focus limits, hyperfocal distance and total depth of field at every aperture and shooting distance.`;
	const h1 = lang === "ru" ? `${name} — калькулятор ГРИП` : `${name} — depth of field calculator`;

	const intro =
		lang === "ru"
			? `${esc(name)} — ${zoom ? "зум-объектив" : "объектив с фиксированным фокусным расстоянием"} для системы «${esc(l.group)}» с фокусным расстоянием ${focalTxt} мм, светосилой ${apTxt} и минимальной диафрагмой f/${l.narrow}. Ниже — готовый калькулятор глубины резко изображаемого пространства (ГРИП) и таблицы для типичных расстояний, рассчитанные по тем же формулам, что и в приложении PhotoSim.`
			: `The ${esc(name)} is a ${zoom ? "zoom" : "prime"} lens for the ${esc(l.group)} system with a focal length of ${focalTxt}mm, a maximum aperture of ${apTxt} and a minimum aperture of f/${l.narrow}. Below is a ready-to-use depth of field (DoF) calculator and tables for typical shooting distances, computed with the same formulas as the PhotoSim app.`;

	const factsLi =
		lang === "ru"
			? [
					`<li><strong>Система:</strong> ${esc(l.group)}</li>`,
					`<li><strong>Матрица:</strong> ${esc(sensorLabel(sensor))}, ${sensor.w} × ${sensor.h} мм${equiv ? "" : ""}</li>`,
					`<li><strong>Фокусное расстояние:</strong> ${focalTxt} мм${equiv}</li>`,
					`<li><strong>Диафрагма:</strong> ${apTxt} … f/${l.narrow}</li>`,
					total3 !== null
						? `<li><strong>ГРИП на 3 м, ${fMid} мм, f/${wMid}:</strong> от ${fmtM(ref.near)} до ${fmtM(ref.far)} м (≈ ${total3} см)</li>`
						: `<li><strong>На 3 м, ${fMid} мм, f/${wMid}:</strong> резко от ${fmtM(ref.near)} м до бесконечности</li>`,
					`<li><strong>Гиперфокальное расстояние (${fMid} мм, f/${nH}):</strong> ${fmtM(hyp)} м</li>`,
				]
			: [
					`<li><strong>Mount / system:</strong> ${esc(l.group)}</li>`,
					`<li><strong>Sensor:</strong> ${esc(sensorLabel(sensor))}, ${sensor.w} × ${sensor.h}mm</li>`,
					`<li><strong>Focal length:</strong> ${focalTxt}mm${equiv}</li>`,
					`<li><strong>Aperture:</strong> ${apTxt} to f/${l.narrow}</li>`,
					total3 !== null
						? `<li><strong>DoF at 3 m, ${fMid}mm, f/${wMid}:</strong> ${fmtM(ref.near)}–${fmtM(ref.far)} m (≈ ${total3} cm deep)</li>`
						: `<li><strong>At 3 m, ${fMid}mm, f/${wMid}:</strong> sharp from ${fmtM(ref.near)} m to infinity</li>`,
					`<li><strong>Hyperfocal distance (${fMid}mm, f/${nH}):</strong> ${fmtM(hyp)} m</li>`,
				];

	const tables = focals
		.map((f) => {
			const aps = aperturesFor(l, f);
			const head =
				`<tr><th>${t.colAperture}</th><th>${t.colH}</th>` +
				DISTANCES.map((d) => `<th>${d} ${lang === "ru" ? "м" : "m"}</th>`).join("") +
				"</tr>";
			const rows = aps
				.map((n) => {
					const hh = dof(f, n, 10, sensor).H;
					return (
						`<tr><td>f/${n}</td><td>${fmtM(hh)} ${lang === "ru" ? "м" : "m"}</td>` +
						DISTANCES.map((d) => {
							const r = dof(f, n, d, sensor);
							return `<td>${fmtM(r.near)}–${fmtM(r.far)}</td>`;
						}).join("") +
						"</tr>"
					);
				})
				.join("");
			const cap = zoom ? `<h3>${f} ${lang === "ru" ? "мм" : "mm"}</h3>` : "";
			return `${cap}<div class="table-wrap"><table class="dof"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
		})
		.join("\n");

	const q1 =
		lang === "ru"
			? `Какая глубина резкости у ${name} на f/${wMid} на расстоянии 3 м?`
			: `What is the depth of field of the ${name} at f/${wMid} and 3 m?`;
	const a1 =
		total3 !== null
			? lang === "ru"
				? `При ${fMid} мм, f/${wMid} и фокусировке на 3 м резкость простирается от ${fmtM(ref.near)} до ${fmtM(ref.far)} м — около ${total3} см.`
				: `At ${fMid}mm, f/${wMid} and focus at 3 m, acceptable sharpness runs from ${fmtM(ref.near)} to ${fmtM(ref.far)} m — about ${total3} cm in total.`
			: lang === "ru"
				? `При ${fMid} мм, f/${wMid} и фокусировке на 3 м резко от ${fmtM(ref.near)} м до бесконечности.`
				: `At ${fMid}mm, f/${wMid} and focus at 3 m, everything from ${fmtM(ref.near)} m to infinity is acceptably sharp.`;
	const q2 =
		lang === "ru"
			? `Чему равно гиперфокальное расстояние ${name}?`
			: `What is the hyperfocal distance of the ${name}?`;
	const a2 =
		lang === "ru"
			? `При ${fMid} мм и f/${nH} на матрице ${sensorLabel(sensor)} гиперфокальное расстояние — около ${fmtM(hyp)} м. Сфокусировавшись на нём, вы получите резкость от ${fmtM(hyp / 2)} м до бесконечности.`
			: `At ${fMid}mm and f/${nH} on a ${sensorLabel(sensor)} sensor the hyperfocal distance is about ${fmtM(hyp)} m. Focus there and everything from ${fmtM(hyp / 2)} m to infinity is sharp.`;
	const q3 =
		lang === "ru"
			? `Как получить более размытый фон на ${name}?`
			: `How do I get more background blur with the ${name}?`;
	const a3 =
		lang === "ru"
			? `Откройте диафрагму до f/${wMid}, подойдите ближе к объекту и увеличьте расстояние от объекта до фона${zoom ? ", используйте длинный конец зума" : ""}. Проверить результат можно в калькуляторе выше.`
			: `Open the aperture to f/${wMid}, move closer to your subject and increase the distance between subject and background${zoom ? ", and zoom in to the long end" : ""}. You can check the result in the calculator above.`;
	const faq = [
		[q1, a1],
		[q2, a2],
		[q3, a3],
	];

	const siblings = LENSES.filter((x) => x.group === l.group && x.id !== l.id).slice(0, 12);
	const jsonld = [
		{
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: faq.map(([q, a]) => ({
				"@type": "Question",
				name: q,
				acceptedAnswer: { "@type": "Answer", text: a },
			})),
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "PhotoSim", item: homeUrl(lang) },
				{ "@type": "ListItem", position: 2, name: t.all, item: hubUrl(lang) },
				{ "@type": "ListItem", position: 3, name, item: lensUrl(l, lang) },
			],
		},
	];

	return (
		head({
			lang,
			title,
			desc,
			canonical: lensUrl(l, lang),
			altEn: lensUrl(l, "en"),
			altRu: lensUrl(l, "ru"),
			root,
			jsonld,
		}) +
		`
${langSwitch(lang, lang === "en" ? "./" : `../../../lenses/${l.id}/`, lang === "ru" ? "./" : `../../ru/lenses/${l.id}/`)}
<nav class="crumbs" aria-label="Breadcrumb"><a href="${lang === "ru" ? root + "ru/" : root}">PhotoSim</a> › <a href="../">${t.all}</a> › ${esc(name)}</nav>
<header class="hero-simple">
<h1>${esc(h1)}</h1>
<p>${intro}</p>
<div class="cta-row"><a class="cta" href="${APK}" download>${t.download}</a> <span class="cta-meta num">${t.meta}</span></div>
</header>
<iframe class="page-embed" src="${root}simulator.html?lens=${l.id}" title="${esc(h1)}" loading="lazy" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>
${lang === "ru" ? `<script>const f=document.querySelector(".page-embed");f.addEventListener("load",()=>f.contentWindow?.postMessage({type:"photosim-language",language:"ru"},"*"));</script>` : ""}
<article>
<h2>${t.factsH}</h2>
<ul class="facts">${factsLi.join("")}</ul>
<h2>${t.tableH}</h2>
<p>${t.unitNote}</p>
${tables}
<h2>${t.faqH}</h2>
${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
<h2>${t.relatedH}</h2>
<ul class="chips">${siblings.map((x) => `<li><a href="../${x.id}/">${esc(fullName(x))}</a></li>`).join("")}<li><a href="../">${t.browse} →</a></li></ul>
</article>
` +
		foot(lang)
	);
}

// ---------- hub ----------
function hubPage(lang) {
	const t = T[lang];
	const root = lang === "ru" ? "../../" : "../";
	const title =
		lang === "ru"
			? "Калькулятор ГРИП для объективов Canon, Nikon, Sony, Fujifilm, Sigma, Tamron | PhotoSim"
			: "Depth of Field Calculator for Canon, Nikon, Sony, Fujifilm, Sigma & Tamron Lenses | PhotoSim";
	const desc =
		lang === "ru"
			? `Таблицы глубины резкости (ГРИП) и гиперфокального расстояния для ${LENSES.length} реальных объективов Canon, Nikon, Sony, Fujifilm, Micro 4/3, Sigma и Tamron.`
			: `Depth of field tables and hyperfocal distances for ${LENSES.length} real lenses from Canon, Nikon, Sony, Fujifilm, Micro Four Thirds, Sigma and Tamron.`;
	const groups = [...new Set(LENSES.map((l) => l.group))];
	const intro =
		lang === "ru"
			? "Выберите объектив, чтобы увидеть таблицу ГРИП, гиперфокальное расстояние и интерактивный калькулятор глубины резкости. Все значения считаются для реального диапазона диафрагм и фокусных расстояний каждой модели."
			: "Pick a lens to see its depth of field table, hyperfocal distance and an interactive DoF calculator. Every value is computed for the real aperture and focal-length range of that model.";
	const jsonld = [
		{
			"@context": "https://schema.org",
			"@type": "CollectionPage",
			name: title,
			url: hubUrl(lang),
			inLanguage: t.htmlLang,
			mainEntity: {
				"@type": "ItemList",
				itemListElement: LENSES.map((l, i) => ({
					"@type": "ListItem",
					position: i + 1,
					url: lensUrl(l, lang),
					name: fullName(l),
				})),
			},
		},
	];
	return (
		head({
			lang,
			title,
			desc,
			canonical: hubUrl(lang),
			altEn: hubUrl("en"),
			altRu: hubUrl("ru"),
			root,
			jsonld,
		}) +
		`
${langSwitch(lang, lang === "en" ? "./" : "../../lenses/", lang === "ru" ? "./" : "../ru/lenses/")}
<nav class="crumbs" aria-label="Breadcrumb"><a href="${lang === "ru" ? root + "ru/" : root}">PhotoSim</a> › ${t.all}</nav>
<header class="hero-simple">
<h1>${lang === "ru" ? "Калькулятор ГРИП для объективов" : "Depth of field calculator by lens"}</h1>
<p>${intro}</p>
</header>
<article>
${groups
	.map(
		(g) =>
			`<h2>${esc(g)}</h2><ul class="chips">${LENSES.filter((l) => l.group === g)
				.map((l) => `<li><a href="${l.id}/">${esc(fullName(l))}</a></li>`)
				.join("")}</ul>`,
	)
	.join("\n")}
</article>
` +
		foot(lang)
	);
}

// ---------- write ----------
function write(rel, content) {
	const file = path.join(DOCS, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}
for (const lang of ["en", "ru"]) {
	const base = lang === "ru" ? "ru/lenses" : "lenses";
	write(`${base}/index.html`, hubPage(lang));
	for (const l of LENSES) write(`${base}/${l.id}/index.html`, lensPage(l, lang));
}

// ---------- sitemap ----------
const alt = (en, ru) =>
	`    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>\n    <xhtml:link rel="alternate" hreflang="ru" href="${ru}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`;
const entries = [
	[homeUrl("en"), homeUrl("ru"), "1.0"],
	[homeUrl("ru"), homeUrl("en"), "1.0"],
	[hubUrl("en"), hubUrl("ru"), "0.8"],
	[hubUrl("ru"), hubUrl("en"), "0.8"],
];
for (const l of LENSES) {
	entries.push([lensUrl(l, "en"), lensUrl(l, "ru"), "0.6"]);
	entries.push([lensUrl(l, "ru"), lensUrl(l, "en"), "0.6"]);
}
const lastmod = new Date().toISOString().slice(0, 10);
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
	.map(([loc, other, pr]) => {
		const isRu = loc.includes("/ru/");
		const en = isRu ? other : loc;
		const ru = isRu ? loc : other;
		return `  <url>\n    <loc>${loc}</loc>\n${alt(en, ru)}\n    <lastmod>${lastmod}</lastmod>\n    <priority>${pr}</priority>\n  </url>`;
	})
	.join("\n")}
</urlset>
`;
write("sitemap.xml", sm);
// fallbacks: Search Console is sometimes picky about github.io sitemaps, so
// also publish a plain URL list and a bare XML sitemap (no xhtml extension)
write("sitemap.txt", entries.map((e) => e[0]).join("\n") + "\n");
write(
	"sitemap-pages.xml",
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
		.map((e) => `  <url><loc>${e[0]}</loc><lastmod>${lastmod}</lastmod></url>`)
		.join("\n")}\n</urlset>\n`,
);
console.log(`lenses: ${LENSES.length}, pages: ${entries.length}`);

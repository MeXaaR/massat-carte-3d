# Massat et alentours — carte 3D

**[Ouvrir la carte](https://mexaar.github.io/massat-carte-3d/)**

Carte publique de Massat et de ses six communes voisines : Biert, Boussenac, Ercé, Le Port, Rabat-les-Trois-Seigneurs et Saurat. Territoire administratif de 258,220 km², relief IGN, bâtiments, boisements et parcelles cadastrales.

## Utilisation

Massat seule s’affiche au démarrage. Choisir une autre commune ou « Toute la région » dans le menu. Rechercher une parcelle, un hameau ou une rue ; la sélection recentre la carte. Le bouton « Parcelles » affiche le cadastre, « Satellite » les photographies IGN et « Détails » les arbres et bâtiments proches.

Glisser pour déplacer la carte, utiliser la molette pour zoomer, clic droit glissé ou Ctrl + clic pour tourner et incliner. Navigation tactile à deux doigts et boutons de cadrage, nord et 2D/3D disponibles.

## Sources et précision

© IGN ; © DGFiP / Etalab — Licence Ouverte 2.0. Conserver ces attributions lors de la réutilisation des données.

Sources : IGN ADMIN EXPRESS COG 2026, BD TOPO V3, MNT LiDAR HD, orthophotographies et CoSIA D009 2025 ; cadastre Etalab du 1er juin 2026. Extraction du 19 septembre 2026. Les millésimes de prise de vue diffèrent selon les couches.

Le relief n’est pas exagéré. Les exports de terrain et de photographie ont une maille de 1 m ; celle-ci ne garantit pas l’exactitude des sources. Les 1 355 bâtiments sans hauteur restent à plat. Les arbres, toits et fenêtres sont symboliques ; les emprises du bâti et les contours des boisements proviennent de l’IGN. Le cadastre est indicatif et ne remplace pas un bornage.

[IGN](https://geoservices.ign.fr/) · [Cadastre Etalab](https://cadastre.data.gouv.fr/datasets/cadastre-etalab) · [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)

## Développement

Node.js 24 ou plus récent est recommandé.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

L’application est construite avec TypeScript, Vite, MapLibre et Three.js. Le dossier `public/data` contient les données d’affichage prêtes à servir, dont le relief WebP sans perte, les normales des bâtiments précalculées et les index de recherche par commune. Les sources SIG brutes ne sont pas incluses.

Le chemin de publication par défaut est `/massat-carte-3d/`. Pour une publication à la racine d’un domaine : `BASE_PATH=/ npm run build`. Après modification des données, renouveler `revision` dans `data-version.json` pour éviter les anciens fichiers en cache.

## Publication GitHub Pages

Le code source et les données sont sur `main`. GitHub Pages sert la racine de la branche `gh-pages`, qui contient le résultat de `npm run build`, avec `.nojekyll`. Mettre à jour cette branche avec le contenu de `dist` pour publier une nouvelle version. Aucune fonction serveur ni clé API n’est nécessaire.

L’export complet occupe environ 786 Mo ; les visiteurs chargent progressivement les secteurs affichés. La compression HTTP et le cache dépendent de GitHub Pages.

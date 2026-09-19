# Massat et alentours — carte 3D

**[Ouvrir la carte](https://mexaar.github.io/massat-carte-3d/)**

Carte publique de Massat et de ses six communes voisines : Biert, Boussenac, Ercé, Le Port, Rabat-les-Trois-Seigneurs et Saurat. Territoire administratif de 258,220 km², relief IGN, bâtiments, boisements et parcelles cadastrales.

## Utilisation

Massat seule s’affiche au démarrage. Choisir une autre commune ou « Toute la région » dans le menu. Rechercher une parcelle, un hameau ou une rue ; la sélection recentre la carte. Le bouton « Parcelles » affiche le cadastre, « Satellite » les photographies IGN et « Détails » les arbres et bâtiments proches.

« Urbanisme » charge le zonage PLU/PLUi et les secteurs de cartes communales depuis l’API officielle de la DDT de l’Ariège. Les codes s’affichent sur la carte ; cliquer sur une zone donne sa date et le lien vers son règlement officiel. « Actualiser » relance les appels à la source. Aucun zonage n’est figé dans ce dépôt.

« Centres proposés » montre les périmètres utilisés pour le rendu des bâtiments : enveloppes de zones habitées IGN portant le nom du village, sauf Boussenac où le noyau d’Espiés autour de la mairie est proposé. Ces contours ne constituent pas un zonage réglementaire.

Glisser pour déplacer la carte, utiliser la molette pour zoomer, clic droit glissé ou Ctrl + clic pour tourner et incliner. Navigation tactile à deux doigts et boutons de cadrage, nord et 2D/3D disponibles.

## Sources et précision

© IGN ; © DGFiP / Etalab — Licence Ouverte 2.0. Conserver ces attributions lors de la réutilisation des données.

Sources : IGN ADMIN EXPRESS COG 2026, BD TOPO V3, MNT LiDAR HD, orthophotographies et CoSIA D009 2025 ; cadastre Etalab du 1er juin 2026. Extraction du 19 septembre 2026. Les millésimes de prise de vue diffèrent selon les couches.

Le relief n’est pas exagéré. Les exports de terrain et de photographie ont une maille de 1 m ; celle-ci ne garantit pas l’exactitude des sources. Les 1 355 bâtiments sans hauteur restent à plat. Les arbres, toits et fenêtres sont symboliques ; les emprises du bâti et les contours des boisements proviennent de l’IGN. Les hauteurs IGN d’origine sont conservées. Hors centres proposés, le rendu est plafonné à 8,1 m (deux niveaux symboliques de 2,8 m et une hauteur de toiture de 2,5 m), avec deux rangées de fenêtres au maximum. Dans les centres, les hauteurs IGN sont conservées et les fenêtres limitées à trois rangées. Les églises et chapelles sont exemptées. Ce réglage corrige le rendu de 1 876 bâtiments ; il ne constitue pas un relevé de leur nombre réel de niveaux. Le cadastre est indicatif et ne remplace pas un bornage.

[IGN](https://geoservices.ign.fr/) · [Cadastre Etalab](https://cadastre.data.gouv.fr/datasets/cadastre-etalab) · [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)

## Urbanisme en direct

Source : [carte officielle DDT 09](https://carto2.geo-ide.din.developpement-durable.gouv.fr/frontoffice/?map=d8de8132-4e9f-4a0a-b3d5-cf9d980c321c). Le client découvre les services WFS à partir de la configuration publique de cette carte, puis interroge les deux couches par code INSEE. Les géométries, codes, dates et liens vers les règlements sont lus à chaque récupération. Le champ DATAPPRO est présenté comme date du document, sans le confondre avec la date de récupération.

Les appels commencent uniquement à l’activation de la couche. Un cache en mémoire de cinq minutes limite les appels lors des changements de commune ; « Actualiser » le contourne. La couche active se rafraîchit après quinze minutes lorsque l’onglet est visible. Les requêtes annulées ou anciennes ne peuvent pas remplacer le territoire courant. Un échec du service est distingué d’une réponse sans zones et n’empêche pas l’usage du fond de carte.

L’API autorise les appels directs depuis GitHub Pages ; aucun proxy ni secret n’est requis. La fraîcheur dépend des publications de la DDT. Les autres prescriptions et servitudes restent à consulter sur la carte officielle. L’absence de résultat pour une commune signifie seulement que ce service n’y renvoie pas de zonage.

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

L’export complet occupe environ 781 Mo ; les visiteurs chargent progressivement les secteurs affichés. La compression HTTP et le cache dépendent de GitHub Pages.

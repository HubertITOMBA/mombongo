# Entreprises, clients et adresses

## État
Modèles Prisma User, Organization, Membership, Customer et Address migrés.
La création du compte est disponible pour les particuliers et les entreprises.
L’entreprise et son propriétaire sont créés uniquement pour une inscription BUSINESS.
Le CRUD clients et adresses reste à développer.

Distinguer l’entreprise abonnée de ses clients facturés. Rôles prévus : propriétaire, administrateur, membre, comptable ; la matrice de permissions reste à détailler avant les endpoints.

Un client possède plusieurs adresses : personnelle, facturation, livraison, bureau et autre. Adresse structurée et pays ISO à deux lettres ; le schéma Zod valide le format, le référentiel des pays sera vérifié par le service. Ne pas déduire le pays d’une adresse du fuseau horaire.

Chaque adresse appartient au même tenant que son client, garanti par une relation composite Prisma. Les adresses personnelles des utilisateurs abonnés feront l’objet d’un modèle séparé si nécessaire. À l’émission d’une facture, copier l’adresse applicable sur le document : modifier une fiche client ne doit pas réécrire une facture émise.

Validation future : création, modification, archivage, accès inter-entreprises, plusieurs adresses par type et contrôles de références avant suppression.

Un particulier inscrit (User INDIVIDUAL) est distinct d’une fiche client Customer
maintenue par une entreprise. Aucun partage implicite de coordonnées ou de factures
n’est réalisé entre ces deux entités.

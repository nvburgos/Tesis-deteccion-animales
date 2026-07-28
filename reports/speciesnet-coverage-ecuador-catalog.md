# SpeciesNet coverage against Ecuador catalog

Country geofence checked: `ECU`
SpeciesNet model directory: `C:\Users\rfrei\.cache\kagglehub\models\google\speciesnet\pyTorch\v4.0.2a\1`

## Summary

- Catalog entries reviewed: 2399
- Direct model species matches: 347
- Taxonomy-only species matches: 0
- Binomial matches for catalog subspecies/taxonomic variants: 9
- Detectable matches allowed for Ecuador: 327
- Detectable matches blocked or not explicitly allowed for Ecuador: 29
- Not found in SpeciesNet taxonomy/model labels: 2043

## Detectable direct matches by group

- Ave: 286
- Mamifero: 69
- Reptil: 1

## Detectable and allowed for Ecuador by group

- Ave: 260
- Mamifero: 66
- Reptil: 1

## Match Levels By Group

### Ave
- direct_model_species: 278
- binomial_model_species: 8
- taxonomy_only_species: 0
- not_found: 1484

### Mamifero
- direct_model_species: 69
- binomial_model_species: 0
- taxonomy_only_species: 0
- not_found: 394

### Reptil
- direct_model_species: 0
- binomial_model_species: 1
- taxonomy_only_species: 0
- not_found: 165

## Notes

- `direct_model_species` means the exact scientific binomial appears as a SpeciesNet classifier label.
- `binomial_model_species` means the catalog entry had extra words, usually a subspecies, but the first two words match a SpeciesNet classifier label.
- `taxonomy_only_species` means the name appears in SpeciesNet taxonomy but not as a direct classifier output label.
- `not_found` means it was not found in the local SpeciesNet model taxonomy or classifier labels.
- `allowed` means the local geofence file does not block that class for Ecuador. This is not a promise of high accuracy.

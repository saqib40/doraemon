# Graph Data Model
## Nodes
1 - **:File**

Properties:

*id (string, Unique)*: The relative path of the file from the repo root.

*repo (string, Indexed)*: The unique name of the repository (e.g., 'facebook/react').

*name (string)*: The base name of the file (e.g., 'index.js').

2 - **:Repository**

Properties:

*name (string, Unique)*: The unique name of the repository (e.g., 'facebook/react').

*lastAnalyzedSha (string)*: The full commit SHA of the main branch at the time of the last successful analysis.

## Relationships
1- **-[:IMPORTS]->**

Connects two :File nodes.

Direction: (importer)-[:IMPORTS]->(imported)

# Acknowledgements :
- [Vis JS](https://visjs.org/)
- [ts-morph](https://github.com/dsherret/ts-morph?tab=readme-ov-file)
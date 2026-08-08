#!/usr/bin/env node
// Run locally: RAILWAY_TOKEN=ee43f749-... node scripts/get-railway-domain.mjs
// This script lists Railway projects and their domains

const token = process.env.RAILWAY_TOKEN || process.argv[2];
if (!token) {
  console.error('Usage: RAILWAY_TOKEN=xxx node scripts/get-railway-domain.mjs');
  process.exit(1);
}

const query = `
query {
  me {
    email
    projects(first: 20) {
      edges {
        node {
          id
          name
          services(first: 20) {
            edges {
              node {
                id
                name
                domains {
                  edges { node { domain } }
                }
                serviceInstances(first: 5) {
                  edges {
                    node {
                      domains {
                        edges { node { domain } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

fetch('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ query }),
})
  .then(r => r.text())
  .then(t => {
    try {
      const j = JSON.parse(t);
      console.log(JSON.stringify(j, null, 2));
      const projects = j.data?.me?.projects?.edges || [];
      for (const p of projects) {
        console.log(`\nProject: ${p.node.name} (${p.node.id})`);
        for (const s of p.node.services.edges) {
          console.log(`  Service: ${s.node.name} (${s.node.id})`);
          console.log(`    Domains: ${s.node.domains.edges.map(d=>d.node.domain).join(', ')}`);
          for (const inst of s.node.serviceInstances.edges) {
            console.log(`    Instance Domains: ${inst.node.domains.edges.map(d=>d.node.domain).join(', ')}`);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse:', t.slice(0, 1000));
    }
  })
  .catch(e => console.error(e));

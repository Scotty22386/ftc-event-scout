async function test() {
  const queryStr1 = `
    query GetEventTeams($code: String!) {
      eventByCode(code: $code) {
        name
        teams {
          teamNumber
          team {
            name
            schoolName
            city
            state
          }
        }
      }
    }
  `;

  const queryStr2 = `
    query GetEventTeams2($code: String!) {
      event(code: $code) {
        name
        teams {
          teamNumber
          team {
            name
            schoolName
            city
            state
          }
        }
      }
    }
  `;

  // We will try query 1 first
  try {
    console.log("Trying query 1 (eventByCode)...");
    const response = await fetch("https://api.ftcscout.org/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query: queryStr1, variables: { code: "usinjone" } }),
    });

    console.log("Query 1 Status:", response.status);
    const json = await response.json();
    console.log("Query 1 Response:", JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("Query 1 Error:", err);
  }

  // We will try query 2 next
  try {
    console.log("\nTrying query 2 (event)...");
    const response = await fetch("https://api.ftcscout.org/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query: queryStr2, variables: { code: "usinjone" } }),
    });

    console.log("Query 2 Status:", response.status);
    const json = await response.json();
    console.log("Query 2 Response:", JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("Query 2 Error:", err);
  }
}

test();

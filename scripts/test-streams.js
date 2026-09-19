/**
 * Script de prueba para diagnosticar problemas con las APIs de streaming
 * Este script permite verificar qué ligas y partidos están disponibles en RapidAPI
 * sin depender de partidos en vivo.
 */

// Load environment variables
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

const STREAM_API_BASE = "https://football-live-stream-api.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPIDAPI_KEY;

async function testRapidAPI() {
  console.log("=== Testing RapidAPI ===");
  console.log(`API Key configured: ${RAPID_API_KEY ? 'YES' : 'NO'}`);
  
  if (!RAPID_API_KEY) {
    console.error("❌ RAPIDAPI_KEY not found in .env.local");
    return;
  }

  try {
    // Test 1: Fetch all matches
    console.log("\n📡 Fetching all matches from RapidAPI...");
    const res = await fetch(`${STREAM_API_BASE}/all-match`, {
      headers: {
        "X-RapidAPI-Key": RAPID_API_KEY,
        "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
      },
    });

    if (!res.ok) {
      console.error(`❌ Failed to fetch: ${res.status} ${res.statusText}`);
      console.error("Response headers:");
      res.headers.forEach((value, name) => {
        console.error(`  ${name}: ${value}`);
      });
      
      // Try to get error response body
      try {
        const errorText = await res.text();
        console.error("Response body:", errorText);
      } catch {
        console.error("Could not read response body");
      }
      return;
    }

    const data = await res.json();
    const matches = data.result || [];
    
    console.log(`✅ Fetched ${matches.length} total matches`);
    
    // Test 2: Analyze available leagues
    const leagues = [...new Set(matches.map(m => m.league))];
    console.log(`\n🏆 Available leagues (${leagues.length}):`);
    leagues.forEach(league => {
      const leagueMatches = matches.filter(m => m.league === league);
      console.log(`  - ${league}: ${leagueMatches.length} matches`);
    });

    // Test 3: Analyze by status
    const liveMatches = matches.filter(m => m.status === "Live");
    const upcomingMatches = matches.filter(m => m.status !== "Live");
    
    console.log(`\n📊 Match status breakdown:`);
    console.log(`  - Live: ${liveMatches.length}`);
    console.log(`  - Other: ${upcomingMatches.length}`);

    // Test 4: Show sample matches from each league
    console.log(`\n📋 Sample matches from each league:`);
    leagues.slice(0, 5).forEach(league => {
      const leagueMatches = matches.filter(m => m.league === league);
      const sample = leagueMatches.slice(0, 2);
      sample.forEach(m => {
        console.log(`  [${m.league}] ${m.home_name} vs ${m.away_name} (${m.status}) - ID: ${m.id}`);
      });
    });

    // Test 5: Test specific league matching
    console.log(`\n🔍 Testing specific league availability:`);
    const targetLeagues = ["Copa Libertadores", "Copa Sudamericana", "Liga BetPlay", "Premier League", "La Liga"];
    targetLeagues.forEach(targetLeague => {
      const found = leagues.find(l => l.toLowerCase().includes(targetLeague.toLowerCase()) || 
                                       targetLeague.toLowerCase().includes(l.toLowerCase()));
      if (found) {
        const count = matches.filter(m => m.league === found).length;
        console.log(`  ✅ ${targetLeague}: Found as "${found}" with ${count} matches`);
      } else {
        console.log(`  ❌ ${targetLeague}: Not found in API`);
      }
    });

    // Test 6: Test team name matching
    console.log(`\n🔍 Testing team name matching logic:`);
    const testCases = [
      ["Boca Juniors", "Boca"],
      ["River Plate", "River"],
      ["Real Madrid", "Real Madrid CF"],
      ["Atletico Nacional", "Atlético Nacional"],
      ["Junior", "Junior FC"],
    ];
    
    testCases.forEach(([name1, name2]) => {
      const match = teamsMatch(name1, name2);
      console.log(`  "${name1}" vs "${name2}": ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
    });

  } catch (error) {
    console.error("❌ Error testing RapidAPI:", error);
  }
}

// Copy the teamsMatch function from streaming.ts
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamsMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wordsA = a.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const wordsB = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (normalize(wa) === normalize(wb)) return true;
      if (normalize(wa).includes(normalize(wb)) || normalize(wb).includes(normalize(wa))) {
        return true;
      }
    }
  }

  return false;
}

// Run the test
testRapidAPI().then(() => {
  console.log("\n=== Test completed ===");
  process.exit(0);
}).catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});

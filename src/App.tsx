import React, { useState, useEffect } from "react";
import { ScoutingEvent, FTCTeam } from "./types";
import EventSelector from "./components/EventSelector";
import TeamsList from "./components/TeamsList";
import ScoutForm from "./components/ScoutForm";
import ScoutingHistory from "./components/ScoutingHistory";
import EventStats from "./components/EventStats";
import AllianceSelectionAdvisor from "./components/AllianceSelectionAdvisor";
import TeamLogin from "./components/TeamLogin";
import { collection, doc, getDocs, getDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./lib/firebase";
import { Layers, Users, BarChart3, FileSpreadsheet, History, BrainCircuit, ShieldAlert, Award, Compass, Info, LogOut, Sparkles, Calendar, MapPin, ChevronRight, Loader2, ArrowRight } from "lucide-react";

export default function App() {
  const [selectedEvent, setSelectedEvent] = useState<ScoutingEvent | null>(null);
  const [teams, setTeams] = useState<FTCTeam[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "scout-sheet" | "history" | "teams" | "alliance-advisor">("dashboard");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [preselectedTeamNum, setPreselectedTeamNum] = useState<string>("");

  // Team login / profile states
  const [loggedInTeam, setLoggedInTeam] = useState<{ teamNumber: string; teamName: string; season: number } | null>(null);
  const [teamEvents, setTeamEvents] = useState<any[]>([]);
  const [loadingTeamEvents, setLoadingTeamEvents] = useState(false);
  const [teamEventsError, setTeamEventsError] = useState<string | null>(null);
  const [teamEventsIsAllEvents, setTeamEventsIsAllEvents] = useState(false);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("loggedInTeam");
    if (stored) {
      try {
        setLoggedInTeam(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing stored team profile session:", e);
      }
    }
  }, []);

  // Fetch events when logged-in team profile is loaded or changed
  useEffect(() => {
    if (loggedInTeam) {
      fetchTeamEvents(loggedInTeam.teamNumber, loggedInTeam.season);
    } else {
      setTeamEvents([]);
      setTeamEventsIsAllEvents(false);
    }
  }, [loggedInTeam?.teamNumber, loggedInTeam?.season]);

  const fetchTeamEvents = async (teamNumber: string, season: number) => {
    setLoadingTeamEvents(true);
    setTeamEventsError(null);
    setTeamEventsIsAllEvents(false);

    // Query 1: Nesting with season on the team events field
    const query1 = `
      query GetTeamEvents($teamNumber: Int!, $season: Int!) {
        teamByNumber(number: $teamNumber) {
          name
          events(season: $season) {
            event {
              code
              name
              location {
                city
                state
                country
              }
            }
          }
        }
      }
    `;

    // Query 2: Try without season argument inside team (we filter season on client side)
    const query2 = `
      query GetTeamEventsNoSeason($teamNumber: Int!) {
        teamByNumber(number: $teamNumber) {
          name
          events {
            season
            event {
              code
              name
              location {
                city
                state
                country
              }
            }
          }
        }
      }
    `;

    // Query 3: Simpler flat events structure inside events (with location)
    const query3 = `
      query GetTeamEventsFlat($teamNumber: Int!, $season: Int!) {
        teamByNumber(number: $teamNumber) {
          name
          events(season: $season) {
            event {
              code
              name
              location {
                city
                state
                country
              }
            }
          }
        }
      }
    `;

    // Query 4: Flat events without season (with location)
    const query4 = `
      query GetTeamEventsFlatNoSeason($teamNumber: Int!) {
        teamByNumber(number: $teamNumber) {
          name
          events {
            event {
              code
              name
              location {
                city
                state
                country
              }
            }
          }
        }
      }
    `;

    // Query 5: Fallback to get team name, then list all events for season
    const query5 = `
      query GetTeamOnly($teamNumber: Int!) {
        teamByNumber(number: $teamNumber) {
          name
        }
      }
    `;

    const tryQuery = async (queryStr: string, vars: any) => {
      const res = await fetch("/api/ftc-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryStr, variables: vars }),
      });
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const json = await res.json();
      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors[0].message);
      }
      return json.data;
    };

    try {
      // Query 1
      const data = await tryQuery(query1, { teamNumber: parseInt(teamNumber), season });
      const list = data?.teamByNumber?.events || [];
      const formatted = list.map((item: any) => ({
        code: item.event?.code || "",
        name: item.event?.name || "Official Event",
        region: item.event?.location?.state || item.event?.location?.country || "Unknown",
      })).filter((e: any) => e.code);
      
      setTeamEvents(formatted);
      setLoadingTeamEvents(false);
      return;
    } catch (err1: any) {
      console.warn("Query 1 failed, trying Query 2...", err1.message);

      try {
        // Query 2
        const data = await tryQuery(query2, { teamNumber: parseInt(teamNumber) });
        const list = data?.teamByNumber?.events || [];
        const filtered = list.filter((item: any) => item.season === season);
        const formatted = filtered.map((item: any) => ({
          code: item.event?.code || "",
          name: item.event?.name || "Official Event",
          region: item.event?.location?.state || item.event?.location?.country || "Unknown",
        })).filter((e: any) => e.code);

        setTeamEvents(formatted);
        setLoadingTeamEvents(false);
        return;
      } catch (err2: any) {
        console.warn("Query 2 failed, trying Query 3...", err2.message);

        try {
          // Query 3
          const data = await tryQuery(query3, { teamNumber: parseInt(teamNumber), season });
          const list = data?.teamByNumber?.events || [];
          const formatted = list.map((item: any) => ({
            code: item.event?.code || item.code || "",
            name: item.event?.name || item.name || "Official Event",
            region: item.event?.location?.state || item.location?.state || "Unknown",
          })).filter((e: any) => e.code);

          setTeamEvents(formatted);
          setLoadingTeamEvents(false);
          return;
        } catch (err3: any) {
          console.warn("Query 3 failed, trying Query 4...", err3.message);

          try {
            // Query 4
            const data = await tryQuery(query4, { teamNumber: parseInt(teamNumber) });
            const list = data?.teamByNumber?.events || [];
            const formatted = list.map((item: any) => ({
              code: item.event?.code || item.code || "",
              name: item.event?.name || item.name || "Official Event",
              region: item.event?.location?.state || item.location?.state || "Unknown",
            })).filter((e: any) => e.code);

            setTeamEvents(formatted);
            setLoadingTeamEvents(false);
            return;
          } catch (err4: any) {
            console.warn("Query 4 failed, trying Fallback (fetching season events list)...", err4.message);

            try {
              // Query 5
              await tryQuery(query5, { teamNumber: parseInt(teamNumber) });
              
              // Load all events for season
              const allEventsQuery = `
                query GetSeasonEvents($season: Int!) {
                  events(season: $season) {
                    code
                    name
                    location {
                      city
                      state
                      country
                    }
                  }
                }
              `;
              const seasonEventsData = await tryQuery(allEventsQuery, { season });
              const list = (seasonEventsData?.events || []).map((e: any) => ({
                code: e.code || "",
                name: e.name || "Official Event",
                region: e.location?.state || e.location?.country || "Unknown",
              })).filter((e: any) => e.code);
              setTeamEvents(list);
              setTeamEventsIsAllEvents(true);
              setLoadingTeamEvents(false);
            } catch (err5: any) {
              console.error("All queries failed:", err5.message);
              setTeamEventsError("Failed to fetch official team event listings from FTC Scout. Please search and select your event manually below.");
              setLoadingTeamEvents(false);
            }
          }
        }
      }
    }
  };



  // Trigger statistic recalculated
  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // Keep track of teams enrolled in current selected event
  useEffect(() => {
    if (!selectedEvent) {
      setTeams([]);
      return;
    }
    
    const fetchTeams = async () => {
      try {
        const teamsRef = collection(db, "events", selectedEvent.id, "teams");
        const snapshot = await getDocs(teamsRef);
        const fetchedTeams: FTCTeam[] = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          fetchedTeams.push({
            teamNumber: d.teamNumber,
            teamName: d.teamName,
            schoolName: d.schoolName || "",
            city: d.city || "",
            state: d.state || "",
          });
        });
        fetchedTeams.sort((a, b) => parseInt(a.teamNumber) - parseInt(b.teamNumber));
        setTeams(fetchedTeams);
      } catch (err) {
        console.error("Error loading event teams:", err);
      }
    };

    fetchTeams();
  }, [selectedEvent?.id, refreshTrigger]);

  const handleSelectEvent = (event: ScoutingEvent | null) => {
    setSelectedEvent(event);
    if (event) {
      triggerRefresh();
    }
  };

  const handleLoginSuccess = (teamInfo: { teamNumber: string; teamName: string; season: number }) => {
    setLoggedInTeam(teamInfo);
    localStorage.setItem("loggedInTeam", JSON.stringify(teamInfo));
  };

  const handleLogout = () => {
    setLoggedInTeam(null);
    setSelectedEvent(null);
    localStorage.removeItem("loggedInTeam");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col pb-12 font-sans text-slate-100 selection:bg-indigo-900 selection:text-indigo-200">
      
      {/* Decorative Branding Line */}
      <div className="h-1.5 w-full bg-linear-to-r from-indigo-700 via-indigo-600 to-blue-600" />

      {/* Main Top Header bar */}
      <header className="bg-slate-900 border-b border-slate-800 py-4.5 px-4 md:px-8 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          
          {/* Logo & Slogan */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/20 font-mono tracking-tighter">
              XR
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-white">
                XRAY
              </h1>
              <p className="text-xs text-slate-400 font-mono uppercase tracking-wider mt-0.5 font-sans font-bold text-indigo-400">XLR8 RECON ANALYTICS</p>
            </div>
          </div>

          {/* Logged In Status / Logout Action */}
          {loggedInTeam && (
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              {/* Profile Card */}
              <div className="bg-slate-950 border border-slate-800 p-2 px-3.5 rounded flex items-center gap-2.5">
                <div className="h-7 w-7 bg-indigo-900/40 text-indigo-400 rounded flex items-center justify-center font-bold font-mono text-xs border border-indigo-500/10">
                  {loggedInTeam.teamNumber}
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-mono leading-none tracking-widest">Logged in Team</p>
                  <p className="text-xs font-bold text-slate-300 mt-1 truncate max-w-[140px]">{loggedInTeam.teamName}</p>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={loggedInTeam.season}
                    onChange={async (e) => {
                      const newSeason = parseInt(e.target.value);
                      const updatedTeam = { ...loggedInTeam, season: newSeason };
                      setLoggedInTeam(updatedTeam);
                      localStorage.setItem("loggedInTeam", JSON.stringify(updatedTeam));
                      
                      // Also update the team profile in Firestore so it's permanently stored!
                      try {
                        const docRef = doc(db, "team_profiles", loggedInTeam.teamNumber);
                        await setDoc(docRef, { season: newSeason }, { merge: true });
                      } catch (err) {
                        console.error("Error updating team profile season in database:", err);
                      }
                    }}
                    className="bg-slate-900 border border-slate-800 text-[10px] text-indigo-400 rounded font-mono font-bold pl-2 pr-6 py-0.5 focus:outline-hidden focus:border-indigo-500 cursor-pointer appearance-none relative text-center"
                    style={{ 
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23818cf8\' stroke-width=\'2.5\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M19.5 8.25l-7.5 7.5-7.5-7.5\' /%3E%3C/svg%3E")', 
                      backgroundPosition: 'right 0.35rem center', 
                      backgroundSize: '0.6rem', 
                      backgroundRepeat: 'no-repeat' 
                    }}
                    title="Change Active Scouting Season"
                  >
                    <option value={2025}>Season 2025</option>
                    <option value={2024}>Season 2024</option>
                    <option value={2023}>Season 2023</option>
                  </select>
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="p-2.5 text-slate-400 hover:text-red-400 bg-slate-900 hover:bg-red-950/20 border border-slate-800 hover:border-red-900/40 rounded transition duration-150 cursor-pointer"
                title="Log Out Profile"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Active Event Banner inside Header */}
          {selectedEvent ? (
            <div className="flex items-center gap-3 bg-slate-950 p-2.5 px-4 rounded border border-slate-800 self-start md:self-auto">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Active Event</p>
                <p className="text-xs font-bold text-slate-300 line-clamp-1">{selectedEvent.name}</p>
              </div>
            </div>
          ) : loggedInTeam ? null : (
            <div className="text-xs font-semibold text-amber-400 bg-amber-950/30 border border-amber-900/50 p-2.5 px-4 rounded flex items-center gap-2 self-start md:self-auto uppercase tracking-wider font-mono">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span>Authentication Gate</span>
            </div>
          )}

        </div>
      </header>

      {/* Main Container Layout */}
      {!loggedInTeam ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <TeamLogin onLoginSuccess={handleLoginSuccess} />
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-4 md:px-8 mt-6 grid grid-cols-1 gap-6 w-full flex-1">
          
          {/* Main selection hub when selectedEvent is null, hidden when selectedEvent is active */}
          <EventSelector
            selectedEvent={selectedEvent}
            onSelectEvent={handleSelectEvent}
            loggedInTeam={loggedInTeam}
            teamEvents={teamEvents}
            loadingTeamEvents={loadingTeamEvents}
            teamEventsError={teamEventsError}
            teamEventsIsAllEvents={teamEventsIsAllEvents}
          />

          {selectedEvent && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Event contextual title and change back triggers */}
              <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-indigo-950 border border-indigo-500/20 rounded flex items-center justify-center text-indigo-400">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{selectedEvent.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">Event Code: <span className="text-slate-200">{selectedEvent.id}</span> • Game: <span className="text-slate-200">{selectedEvent.gameName} ({selectedEvent.season})</span></p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-xs font-bold font-mono uppercase border border-slate-800 hover:border-slate-700 text-slate-300 rounded transition duration-150 cursor-pointer"
                >
                  ← Change Event
                </button>
              </div>

              {/* Tab Navigation controller */}
              <nav className="flex flex-wrap gap-1 p-1 bg-slate-900/80 rounded-lg border border-slate-800 max-w-fit">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "dashboard"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                  Leaderboard
                </button>
                
                <button
                  onClick={() => setActiveTab("scout-sheet")}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "scout-sheet"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Scout Sheet
                </button>

                <button
                  onClick={() => setActiveTab("history")}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "history"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <History className="h-4 w-4" />
                  Scouting Logs
                </button>

                <button
                  onClick={() => setActiveTab("teams")}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "teams"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Teams ({teams.length})
                </button>

                <button
                  onClick={() => setActiveTab("alliance-advisor")}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "alliance-advisor"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <BrainCircuit className="h-4 w-4" />
                  Alliance Advisor
                </button>
              </nav>

              {/* Render Active Tab Component */}
              <div className="transition-all duration-200">
                {activeTab === "dashboard" && (
                  <EventStats
                    selectedEvent={selectedEvent}
                    teams={teams}
                    refreshTrigger={refreshTrigger}
                    onScoutTeam={(teamNum) => {
                      setPreselectedTeamNum(teamNum);
                      setActiveTab("scout-sheet");
                    }}
                  />
                )}

                {activeTab === "scout-sheet" && (
                  <ScoutForm
                    selectedEvent={selectedEvent}
                    teams={teams}
                    initialTeamNum={preselectedTeamNum}
                    onScoutSaved={(keepScouting) => {
                      triggerRefresh();
                      setPreselectedTeamNum("");
                      if (!keepScouting) {
                        setActiveTab("dashboard");
                      }
                    }}
                    onCancel={() => {
                      setPreselectedTeamNum("");
                      setActiveTab("dashboard");
                    }}
                  />
                )}

                {activeTab === "history" && (
                  <ScoutingHistory
                    selectedEvent={selectedEvent}
                    refreshTrigger={refreshTrigger}
                    onHistoryUpdated={triggerRefresh}
                  />
                )}

                {activeTab === "teams" && (
                  <TeamsList
                    selectedEvent={selectedEvent}
                    onTeamsUpdated={triggerRefresh}
                    teams={teams}
                    setTeams={setTeams}
                    onScoutTeam={(teamNum) => {
                      setPreselectedTeamNum(teamNum);
                      setActiveTab("scout-sheet");
                    }}
                  />
                )}

                {activeTab === "alliance-advisor" && (
                  <AllianceSelectionAdvisor
                    selectedEvent={selectedEvent}
                    teams={teams}
                    refreshTrigger={refreshTrigger}
                  />
                )}
              </div>

            </div>
          )}

        </main>
      )}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { collection, doc, setDoc, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScoutingEvent, FTCTeam } from "../types";
import { Users, Plus, Trash2, Search, RefreshCw, AlertCircle, Loader2, Database, MapPin } from "lucide-react";

interface TeamsListProps {
  selectedEvent: ScoutingEvent;
  onTeamsUpdated: () => void;
  teams: FTCTeam[];
  setTeams: React.Dispatch<React.SetStateAction<FTCTeam[]>>;
  onScoutTeam?: (teamNumber: string) => void;
}

export default function TeamsList({ selectedEvent, onTeamsUpdated, teams, setTeams, onScoutTeam }: TeamsListProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [teamNumber, setTeamNumber] = useState("");
  const [teamName, setTeamName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [deleteConfirmTeamNumber, setDeleteConfirmTeamNumber] = useState<string | null>(null);

  const isOfficialEvent = selectedEvent.presetId !== "custom" && selectedEvent.id.length < 15;

  useEffect(() => {
    fetchTeams();
  }, [selectedEvent.id]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      setApiError(null);
      const teamsRef = collection(db, "events", selectedEvent.id, "teams");
      
      let snapshot;
      try {
        snapshot = await getDocs(teamsRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `events/${selectedEvent.id}/teams`);
        return;
      }
      
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

      // AUTO-SYNC ROSTER: If official event and local database roster is empty, sync instantly!
      if (fetchedTeams.length === 0 && isOfficialEvent) {
        console.log("Empty team roster detected. Triggering auto-sync with FTC Scout API for:", selectedEvent.id);
        await handleSyncFromFtcScout(selectedEvent.id);
      }
    } catch (err) {
      console.error("Error fetching teams:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromFtcScout = async (eventCodeOverride?: string) => {
    const code = (eventCodeOverride || selectedEvent.id).trim();
    if (!code) return;

    setSyncing(true);
    setApiError(null);

    // Extract the start year of the season (e.g. "2025-2026" becomes 2025)
    const seasonYear = selectedEvent.season ? parseInt(selectedEvent.season.split("-")[0]) : 2025;

    const queryStr = `
      query GetEventTeams($code: String!, $season: Int!) {
        eventByCode(code: $code, season: $season) {
          name
          teams {
            teamNumber
            team {
              name
              schoolName
              location {
                city
                state
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch("/api/ftc-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryStr,
          variables: { code, season: seasonYear }
        }),
      });

      if (!response.ok) {
        throw new Error("FTC Scout backend proxy returned an error");
      }

      const resJson = await response.json();
      
      if (resJson.errors) {
        throw new Error(resJson.errors[0]?.message || "GraphQL query error");
      }

      const eventData = resJson.data?.eventByCode;
      if (!eventData) {
        throw new Error(`Event not found with code "${code}" in season ${seasonYear} in FTC Scout.`);
      }

      const rawTeams = eventData.teams || [];
      if (rawTeams.length === 0) {
        throw new Error("No teams registered for this event on FTC Scout.");
      }

      // Batch save to Firestore
      const batch = writeBatch(db);
      const importedTeams: FTCTeam[] = [];

      rawTeams.forEach((item: any) => {
        const teamNum = String(item.teamNumber);
        const tInfo = item.team || {};
        const loc = tInfo.location || {};
        
        const ftcTeam: FTCTeam = {
          teamNumber: teamNum,
          teamName: tInfo.name || `Team ${teamNum}`,
          schoolName: tInfo.schoolName || "",
          city: loc.city || "",
          state: loc.state || "",
        };

        importedTeams.push(ftcTeam);

        const docRef = doc(db, "events", selectedEvent.id, "teams", teamNum);
        batch.set(docRef, ftcTeam);
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `events/${selectedEvent.id}/teams`);
        return;
      }

      // Sort and update state
      importedTeams.sort((a, b) => parseInt(a.teamNumber) - parseInt(b.teamNumber));
      setTeams(importedTeams);
      onTeamsUpdated();
    } catch (err: any) {
      console.error("FTC Scout roster sync error:", err);
      setApiError(err.message || "Failed to sync roster from FTC Scout.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddManualTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamNumber.trim() || !teamName.trim()) return;

    try {
      const num = teamNumber.trim();
      const teamDocRef = doc(db, "events", selectedEvent.id, "teams", num);
      
      const newTeam: FTCTeam = {
        teamNumber: num,
        teamName: teamName.trim(),
        schoolName: schoolName.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
      };

      try {
        await setDoc(teamDocRef, newTeam);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `events/${selectedEvent.id}/teams/${num}`);
        return;
      }
      
      // Update local state
      setTeams((prev) => {
        const updated = prev.filter((t) => t.teamNumber !== num);
        const next = [...updated, newTeam];
        next.sort((a, b) => parseInt(a.teamNumber) - parseInt(b.teamNumber));
        return next;
      });

      // Clear form
      setTeamNumber("");
      setTeamName("");
      setSchoolName("");
      setCity("");
      setState("");
      onTeamsUpdated();
    } catch (error) {
      console.error("Error adding team:", error);
    }
  };

  const handleDeleteTeam = async (num: string) => {
    try {
      try {
        await deleteDoc(doc(db, "events", selectedEvent.id, "teams", num));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `events/${selectedEvent.id}/teams/${num}`);
        return;
      }
      setTeams((prev) => prev.filter((t) => t.teamNumber !== num));
      onTeamsUpdated();
      setDeleteConfirmTeamNumber(null);
    } catch (error) {
      console.error("Error deleting team:", error);
    }
  };

  const filteredTeams = teams.filter((t) => 
    t.teamNumber.includes(searchFilter) ||
    t.teamName.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (t.city && t.city.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-md animate-in fade-in duration-200">
      
      {/* Header section with search filter */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 border-b border-slate-800 pb-5 mb-6">
        <div>
          <h2 className="text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Registered Competitors
          </h2>
          <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
            Event Roster for <span className="font-semibold text-indigo-400">{selectedEvent.name}</span>
          </p>
        </div>
        
        {/* Search Input */}
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search team # or name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT PANEL: Sync Control & Manual Add Form */}
        <div className="space-y-5 lg:col-span-1">
          
          {/* FTC Scout Sync Card */}
          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-2 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" />
              FTC Scout API Integrator
            </h3>
            
            {isOfficialEvent ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  This is an official tournament. We can dynamically parse competing team roster data for event <strong className="text-slate-300 uppercase">{selectedEvent.id}</strong>.
                </p>

                <button
                  type="button"
                  onClick={() => handleSyncFromFtcScout()}
                  disabled={syncing || loading}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Syncing FTC Scout...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sync Competing Teams
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-amber-400/80 leading-relaxed font-mono bg-amber-950/20 border border-amber-900/30 p-3 rounded">
                ⚠️ Custom Event Campaign. Automated FTC Scout database sync is disabled. Use manual team addition below.
              </div>
            )}

            {apiError && (
              <div className="mt-3 p-3 bg-red-950/40 text-red-400 rounded border border-red-900/50 text-[11px] flex gap-2 items-start leading-relaxed font-mono">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span>{apiError}</span>
              </div>
            )}
          </div>

          {/* Add Team Manually Form */}
          <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-slate-400" />
              Add Team Manually
            </h3>
            <p className="text-[10px] text-slate-500 mb-4 font-mono leading-relaxed">
              Manually append a competitor if they are not listed or for scrimmage runs.
            </p>
            
            <form onSubmit={handleAddManualTeam} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-400 uppercase mb-0.5 font-mono">Team #</label>
                  <input
                    type="number"
                    placeholder="e.g. 11115"
                    value={teamNumber}
                    onChange={(e) => setTeamNumber(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 uppercase mb-0.5 font-mono">Team Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Gluten Free"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] text-slate-400 uppercase mb-0.5 font-mono">School / Affiliate</label>
                <input
                  type="text"
                  placeholder="e.g. Independent Club"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-400 uppercase mb-0.5 font-mono">City</label>
                  <input
                    type="text"
                    placeholder="e.g. Boston"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 uppercase mb-0.5 font-mono">State/Region</label>
                  <input
                    type="text"
                    placeholder="e.g. MA"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-700"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Add Competitor
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT PANEL: Live Competitor List */}
        <div className="lg:col-span-2 bg-slate-950 p-5 rounded-lg border border-slate-800 flex flex-col h-[550px]">
          <div className="flex justify-between items-center mb-4.5">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              competing roster ({filteredTeams.length} / {teams.length})
            </h3>
          </div>
          
          {loading ? (
            <div className="flex flex-col justify-center items-center flex-1 space-y-3">
              <Loader2 className="h-7 w-7 text-indigo-500 animate-spin" />
              <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest">Loading event roster...</p>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="text-center flex flex-col justify-center items-center flex-1 py-12">
              <Users className="h-8 w-8 text-slate-700 mb-3" />
              <h4 className="text-xs font-bold text-slate-400 uppercase">No Competitors Enrolled</h4>
              <p className="text-xs text-slate-500 max-w-xs mt-2 font-mono leading-relaxed">
                {isOfficialEvent 
                  ? "We couldn't load any teams. Click 'Sync Competing Teams' above to query FTC Scout's dynamic database."
                  : "Start building your roster by manually registering teams using the left panel form."}
              </p>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 pr-1 space-y-2">
              {filteredTeams.map((t) => (
                <div
                  key={t.teamNumber}
                  className="flex justify-between items-center bg-slate-900/60 hover:bg-slate-900 border border-slate-900 hover:border-slate-850 p-3 rounded-lg transition duration-150 group"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="font-mono text-xs font-black px-2.5 py-1.5 bg-indigo-950/60 text-indigo-400 border border-indigo-900/40 rounded-md shrink-0">
                      {t.teamNumber}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{t.teamName}</h4>
                      {(t.city || t.schoolName) && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 font-mono">
                          {t.city && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {t.city}, {t.state}
                            </span>
                          )}
                          {t.city && t.schoolName && <span className="opacity-40">•</span>}
                          {t.schoolName && <span className="truncate max-w-[180px]">{t.schoolName}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {onScoutTeam && (
                      <button
                        onClick={() => onScoutTeam(t.teamNumber)}
                        className="px-3 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[10px] font-bold rounded-md uppercase font-mono transition cursor-pointer shrink-0"
                      >
                        Scout Match
                      </button>
                    )}

                    {deleteConfirmTeamNumber === t.teamNumber ? (
                      <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded animate-in fade-in scale-in duration-100">
                        <button
                          onClick={() => handleDeleteTeam(t.teamNumber)}
                          className="px-2 py-1 bg-red-650 hover:bg-red-700 text-white text-[9px] font-bold rounded uppercase font-mono transition"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirmTeamNumber(null)}
                          className="px-2 py-1 bg-slate-850 text-slate-350 text-[9px] font-bold rounded uppercase font-mono transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmTeamNumber(t.teamNumber)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded opacity-0 group-hover:opacity-100 transition duration-150 shrink-0 animate-in duration-200"
                        title="Remove Team"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScoutingEvent, FTCTeam, ScoutLog, TeamAggregatedStats } from "../types";
import { BarChart3, TrendingUp, Shield, Activity, Star, Eye, ThumbsUp, Medal } from "lucide-react";

interface EventStatsProps {
  selectedEvent: ScoutingEvent;
  teams: FTCTeam[];
  refreshTrigger: number;
  onScoutTeam?: (teamNumber: string) => void;
}

export default function EventStats({ selectedEvent, teams, refreshTrigger, onScoutTeam }: EventStatsProps) {
  const [aggregatedStats, setAggregatedStats] = useState<TeamAggregatedStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"teamNumber" | "avgAutoScored" | "avgTeleopScored" | "avgDriverSkill" | "avgReliability">("avgTeleopScored");
  const [selectedTeam, setSelectedTeam] = useState<TeamAggregatedStats | null>(null);

  useEffect(() => {
    calculateStatistics();
  }, [selectedEvent.id, teams, refreshTrigger]);

  const calculateStatistics = async () => {
    try {
      setLoading(true);
      
      // Fetch all logs for this event
      const logsRef = collection(db, "scout_logs");
      const q = query(logsRef, where("eventId", "==", selectedEvent.id));
      
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, "scout_logs");
        return;
      }
      
      const allLogs: ScoutLog[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        allLogs.push({
          id: doc.id,
          eventId: d.eventId,
          teamNumber: d.teamNumber,
          scoutName: d.scoutName,
          matchNumber: d.matchNumber,
          scoutType: d.scoutType || "match",
          createdAt: d.createdAt,
          autoDrive: d.autoDrive || false,
          autoScoredCount: d.autoScoredCount || 0,
          teleopScoredCount: d.teleopScoredCount || 0,
          defenseRating: d.defenseRating || 3,
          driverSkill: d.driverSkill || 3,
          reliability: d.reliability || 3,
          cooperation: d.cooperation || 3,
          notes: d.notes || "",
          gameSpecificValues: d.gameSpecificValues || {},
        });
      });

      // Group logs by team
      const teamLogsMap: Record<string, ScoutLog[]> = {};
      allLogs.forEach((log) => {
        if (!teamLogsMap[log.teamNumber]) {
          teamLogsMap[log.teamNumber] = [];
        }
        teamLogsMap[log.teamNumber].push(log);
      });

      // Aggregate stats for each enrolled team
      const computedStats: TeamAggregatedStats[] = teams.map((team) => {
        const teamLogs = teamLogsMap[team.teamNumber] || [];
        const matchCount = teamLogs.length;

        // Base averages
        let autoDriveCount = 0;
        let totalAutoScored = 0;
        let totalTeleopScored = 0;
        let totalDefense = 0;
        let totalDriverSkill = 0;
        let totalReliability = 0;
        let totalCooperation = 0;
        const allNotes: string[] = [];
        const scoutNamesSet = new Set<string>();
        let lastScoutedAt = 0;

        // Custom field accumulators
        const customFieldSums: Record<string, number> = {};
        const customFieldCounts: Record<string, Record<string, number>> = {}; // For select options
        
        // Initialize custom fields tracking
        selectedEvent.customFields.forEach(f => {
          if (f.type === "number") customFieldSums[f.id] = 0;
          if (f.type === "boolean") customFieldSums[f.id] = 0;
          if (f.type === "select") customFieldCounts[f.id] = {};
        });

        teamLogs.forEach((log) => {
          if (log.autoDrive) autoDriveCount++;
          totalAutoScored += log.autoScoredCount;
          totalTeleopScored += log.teleopScoredCount;
          totalDefense += log.defenseRating;
          totalDriverSkill += log.driverSkill;
          totalReliability += log.reliability;
          totalCooperation += log.cooperation;
          
          if (log.notes) allNotes.push(log.notes);
          if (log.scoutName) scoutNamesSet.add(log.scoutName);
          if (log.createdAt > lastScoutedAt) lastScoutedAt = log.createdAt;

          // Accumulate custom game metrics
          selectedEvent.customFields.forEach(f => {
            const val = log.gameSpecificValues?.[f.id];
            if (f.type === "number" && typeof val === "number") {
              customFieldSums[f.id] = (customFieldSums[f.id] || 0) + val;
            } else if (f.type === "boolean" && val === true) {
              customFieldSums[f.id] = (customFieldSums[f.id] || 0) + 1;
            } else if (f.type === "select" && typeof val === "string" && val) {
              if (!customFieldCounts[f.id]) customFieldCounts[f.id] = {};
              customFieldCounts[f.id][val] = (customFieldCounts[f.id][val] || 0) + 1;
            }
          });
        });

        // Compute Averages
        const avg = (sum: number) => (matchCount > 0 ? Number((sum / matchCount).toFixed(1)) : 0);
        const rate = (count: number) => (matchCount > 0 ? Number(((count / matchCount) * 100).toFixed(0)) : 0);

        const customAverages: Record<string, any> = {};
        selectedEvent.customFields.forEach(f => {
          if (f.type === "number") {
            customAverages[f.id] = avg(customFieldSums[f.id] || 0);
          } else if (f.type === "boolean") {
            customAverages[f.id] = `${rate(customFieldSums[f.id] || 0)}%`;
          } else if (f.type === "select") {
            // Find most frequent option
            const counts = customFieldCounts[f.id] || {};
            let topOption = "N/A";
            let maxCount = 0;
            Object.entries(counts).forEach(([opt, cnt]) => {
              if (cnt > maxCount) {
                maxCount = cnt;
                topOption = opt;
              }
            });
            customAverages[f.id] = matchCount > 0 ? `${topOption} (${rate(maxCount)}%)` : "N/A";
          } else {
            customAverages[f.id] = "Notes collected";
          }
        });

        return {
          teamNumber: team.teamNumber,
          teamName: team.teamName,
          schoolName: team.schoolName,
          city: team.city,
          state: team.state,
          matchCount,
          autoDriveRate: rate(autoDriveCount),
          avgAutoScored: avg(totalAutoScored),
          avgTeleopScored: avg(totalTeleopScored),
          avgDefense: avg(totalDefense),
          avgDriverSkill: avg(totalDriverSkill),
          avgReliability: avg(totalReliability),
          avgCooperation: avg(totalCooperation),
          customAverages,
          allNotes,
          scoutNames: Array.from(scoutNamesSet),
          lastScoutedAt,
        };
      });

      setAggregatedStats(computedStats);
      
      // Auto-select first team for display if none is selected
      if (computedStats.length > 0 && !selectedTeam) {
        setSelectedTeam(computedStats[0]);
      }
    } catch (err) {
      console.error("Error calculating statistics:", err);
    } finally {
      setLoading(false);
    }
  };

  const sortedStats = [...aggregatedStats].sort((a, b) => {
    if (sortBy === "teamNumber") {
      return parseInt(a.teamNumber) - parseInt(b.teamNumber);
    }
    return b[sortBy] - a[sortBy];
  });

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-md">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            Team Performance Analytics
          </h2>
          <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
            Aggregated scouting intelligence to compare team performance at <span className="font-semibold text-slate-300">{selectedEvent.name}</span>
          </p>
        </div>

        {/* Sort Selection */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono text-[10px]">Sort Ranks By:</span>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-3.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="avgTeleopScored">Avg Teleop Pieces</option>
            <option value="avgAutoScored">Avg Auto Pieces</option>
            <option value="avgDriverSkill">Avg Driver Skill</option>
            <option value="avgReliability">Avg Reliability</option>
            <option value="teamNumber">Team Number</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-500"></div>
        </div>
      ) : aggregatedStats.length === 0 ? (
        <div className="text-center py-12 bg-slate-950 rounded border border-dashed border-slate-800">
          <Activity className="h-8 w-8 text-slate-500 mx-auto mb-2" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400">No telemetry data computed</p>
          <p className="text-[10px] text-slate-600 font-mono mt-1">Log scouting forms to populate the competition leaderboard.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Leaderboard Table */}
          <div className="lg:col-span-2 bg-slate-950/40 p-4 rounded border border-slate-800 flex flex-col h-[500px]">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-2 font-mono">
              <Medal className="h-4 w-4 text-amber-500" />
              Event Leaderboard
            </h3>
            
            <div className="overflow-y-auto flex-1 pr-1 space-y-2">
              {sortedStats.map((team, idx) => {
                const isSelected = selectedTeam?.teamNumber === team.teamNumber;
                return (
                  <div
                    key={team.teamNumber}
                    onClick={() => setSelectedTeam(team)}
                    className={`flex items-center justify-between p-3 rounded border transition cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 border-indigo-500 shadow-sm ring-1 ring-indigo-900/50"
                        : "bg-slate-950 border-slate-900 hover:border-slate-800 text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-slate-500 w-5 text-center">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-indigo-950 text-indigo-400 border border-indigo-850/40 rounded">
                        {team.teamNumber}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{team.teamName}</h4>
                        <p className="text-[10px] text-slate-500 font-mono uppercase">
                          {team.matchCount} {team.matchCount === 1 ? "run" : "runs"} scouted
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-center font-mono">
                        <div>
                          <p className="text-[9px] text-slate-500">AUTO</p>
                          <p className="text-xs font-extrabold text-indigo-400">{team.avgAutoScored}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500">TELEOP</p>
                          <p className="text-xs font-extrabold text-emerald-400">{team.avgTeleopScored}</p>
                        </div>
                      </div>
                      
                      <div className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300">
                        <Eye className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Team Card */}
          {selectedTeam ? (
            <div className="bg-slate-950 p-5 rounded border border-slate-800 flex flex-col justify-between h-[500px]">
              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Team header banner */}
                <div className="pb-3 border-b border-slate-900">
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-lg font-black text-indigo-400">#{selectedTeam.teamNumber}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                        {selectedTeam.matchCount} Logged Runs
                      </span>
                      {onScoutTeam && (
                        <button
                          onClick={() => onScoutTeam(selectedTeam.teamNumber)}
                          className="text-[10px] bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold px-2.5 py-1 rounded font-mono uppercase tracking-wider transition cursor-pointer shrink-0"
                        >
                          + Scout Match
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1">{selectedTeam.teamName}</h3>
                  {selectedTeam.city && (
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      {selectedTeam.schoolName || "Independent affiliate"} • {selectedTeam.city}, {selectedTeam.state}
                    </p>
                  )}
                </div>

                {/* Core reusable stats */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-1 font-mono">Agnostic Base Performance</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Auto Exit Rate</p>
                      <p className="font-mono text-sm font-extrabold text-indigo-300">{selectedTeam.autoDriveRate}%</p>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Avg Auto Pieces</p>
                      <p className="font-mono text-sm font-extrabold text-indigo-300">{selectedTeam.avgAutoScored}</p>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Avg Teleop Pieces</p>
                      <p className="font-mono text-sm font-extrabold text-emerald-400">{selectedTeam.avgTeleopScored}</p>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Reliability Rate</p>
                      <p className="font-mono text-sm font-extrabold text-amber-500">{selectedTeam.avgReliability}/5</p>
                    </div>
                  </div>
                </div>

                {/* Game Specific metrics */}
                {selectedEvent.customFields.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-1 font-mono">Game-Specific Metric Indexes</h4>
                    <div className="bg-indigo-950/20 p-3 rounded border border-indigo-900/30 space-y-1.5 text-xs">
                      {selectedEvent.customFields.map((field) => {
                        const val = selectedTeam.customAverages[field.id];
                        return (
                          <div key={field.id} className="flex justify-between py-1 border-b border-indigo-900/10 last:border-0">
                            <span className="text-slate-400 font-medium">{field.label}:</span>
                            <span className="font-bold text-indigo-300 font-mono text-[11px]">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes log */}
                {selectedTeam.allNotes.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-1 font-mono">Scouter Direct Logs</h4>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {selectedTeam.allNotes.map((note, nIdx) => (
                        <p key={nIdx} className="text-[10px] text-slate-300 bg-slate-900 p-2 rounded border border-slate-850 italic">
                          "{note}"
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick feedback banner */}
              <div className="pt-3 border-t border-slate-900 text-center font-mono">
                <div className="flex gap-2 justify-center text-[9px] uppercase tracking-wider text-slate-500">
                  <span>Avg Driver: <strong className="text-slate-300">{selectedTeam.avgDriverSkill}★</strong></span>
                  <span>•</span>
                  <span>Coop: <strong className="text-slate-300">{selectedTeam.avgCooperation}★</strong></span>
                  <span>•</span>
                  <span>Defense: <strong className="text-slate-300">{selectedTeam.avgDefense}★</strong></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950 rounded border border-dashed border-slate-800 flex items-center justify-center h-[500px]">
              <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Select a team from rank list to inspect detailed metric aggregates</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

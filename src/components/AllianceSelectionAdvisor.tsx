import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScoutingEvent, FTCTeam, ScoutLog, TeamAggregatedStats } from "../types";
import { Sparkles, BrainCircuit, Users2, ShieldQuestion, ArrowLeftRight, Star, Compass, AlertCircle } from "lucide-react";

interface AllianceSelectionAdvisorProps {
  selectedEvent: ScoutingEvent;
  teams: FTCTeam[];
  refreshTrigger: number;
}

export default function AllianceSelectionAdvisor({ selectedEvent, teams, refreshTrigger }: AllianceSelectionAdvisorProps) {
  const [aggregatedStats, setAggregatedStats] = useState<TeamAggregatedStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [strategyPreference, setStrategyPreference] = useState("Balanced (consistent auto + high teleop scoring)");
  const [aiError, setAiError] = useState<string | null>(null);

  // Head to Head State
  const [compareTeam1, setCompareTeam1] = useState("");
  const [compareTeam2, setCompareTeam2] = useState("");

  useEffect(() => {
    calculateStatistics();
  }, [selectedEvent.id, teams, refreshTrigger]);

  const calculateStatistics = async () => {
    try {
      setLoading(true);
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

      const teamLogsMap: Record<string, ScoutLog[]> = {};
      allLogs.forEach((log) => {
        if (!teamLogsMap[log.teamNumber]) {
          teamLogsMap[log.teamNumber] = [];
        }
        teamLogsMap[log.teamNumber].push(log);
      });

      const computedStats: TeamAggregatedStats[] = teams.map((team) => {
        const teamLogs = teamLogsMap[team.teamNumber] || [];
        const matchCount = teamLogs.length;

        let autoDriveCount = 0;
        let totalAutoScored = 0;
        let totalTeleopScored = 0;
        let totalDefense = 0;
        let totalDriverSkill = 0;
        let totalReliability = 0;
        let totalCooperation = 0;
        const allNotes: string[] = [];

        // Custom fields accumulators
        const customFieldSums: Record<string, number> = {};
        const customFieldCounts: Record<string, Record<string, number>> = {};
        
        selectedEvent.customFields.forEach(f => {
          if (f.type === "number" || f.type === "boolean") customFieldSums[f.id] = 0;
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

        const avg = (sum: number) => (matchCount > 0 ? Number((sum / matchCount).toFixed(1)) : 0);
        const rate = (count: number) => (matchCount > 0 ? Number(((count / matchCount) * 100).toFixed(0)) : 0);

        const customAverages: Record<string, any> = {};
        selectedEvent.customFields.forEach(f => {
          if (f.type === "number") {
            customAverages[f.id] = avg(customFieldSums[f.id] || 0);
          } else if (f.type === "boolean") {
            customAverages[f.id] = `${rate(customFieldSums[f.id] || 0)}%`;
          } else if (f.type === "select") {
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
          scoutNames: [],
          lastScoutedAt: 0,
        };
      });

      // Filter out teams with 0 matches scouted so AI only operates on active telemetry
      setAggregatedStats(computedStats.filter((t) => t.matchCount > 0));
    } catch (err) {
      console.error("Error aggregating alliance selection stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryAllianceAdvisor = async () => {
    if (aggregatedStats.length === 0) {
      setAiError("Cannot generate advice without scouting data. Please log match data first.");
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiRecommendation(null);

    try {
      const response = await fetch("/api/alliance-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamData: aggregatedStats,
          strategyPreference,
          eventName: selectedEvent.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to contact AI strategist.");
      }

      const data = await response.json();
      setAiRecommendation(data.recommendation);
    } catch (err: any) {
      console.error("AI Consultant error:", err);
      setAiError(err.message || "Something went wrong. Make sure your Gemini API Key is configured in user secrets.");
    } finally {
      setAiLoading(false);
    }
  };

  const team1Info = aggregatedStats.find((t) => t.teamNumber === compareTeam1);
  const team2Info = aggregatedStats.find((t) => t.teamNumber === compareTeam2);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-md">
      
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-indigo-400" />
          Alliance Selection Strategist
        </h2>
        <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
          Perform head-to-head simulations or consult the server-side Gemini strategist to finalize selection lists.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: AI Advisor */}
        <div className="space-y-6">
          <div className="p-5 bg-indigo-950/20 border border-indigo-900/30 rounded">
            <h3 className="text-xs font-bold text-indigo-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
              Gemini AI Alliance Consultant
            </h3>
            <p className="text-[11px] text-indigo-400/85 mb-4">
              Our advanced LLM processes full scouter spreadsheets to filter top-scoring pairings matching your event goals.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-1.5 font-mono">Alliance Strategy Focus</label>
                <select
                  value={strategyPreference}
                  onChange={(e) => setStrategyPreference(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="Balanced (consistent auto + high teleop scoring)">Balanced (consistent auto + high teleop scoring)</option>
                  <option value="Endgame dominance (maximum climbs + endgame scoring)">Endgame dominance (maximum climbs + endgame scoring)</option>
                  <option value="Defense priority (shutting down high scoring teams)">Defense priority (shutting down high scoring teams)</option>
                  <option value="Autonomous Powerhouse (highest auto success rates)">Autonomous Powerhouse (highest auto success rates)</option>
                </select>
              </div>

              <button
                onClick={handleQueryAllianceAdvisor}
                disabled={aiLoading || aggregatedStats.length === 0}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
              >
                {aiLoading ? (
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-b-transparent rounded-full" />
                    Consulting Strategist Engine...
                  </span>
                ) : (
                  <>
                    <BrainCircuit className="h-4 w-4" />
                    Query AI Selection Advisory
                  </>
                )}
              </button>

              {aiError && (
                <div className="p-3 bg-red-950/40 text-red-400 border border-red-900/30 rounded text-[11px] flex gap-1.5 items-start">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              )}
            </div>
          </div>

          {/* AI Result Area */}
          {aiRecommendation ? (
            <div className="p-5 bg-slate-950 border border-slate-800 rounded max-h-[450px] overflow-y-auto space-y-4 animate-in fade-in duration-200">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 border-b border-slate-800 pb-2 font-mono">
                <Compass className="h-3.5 w-3.5 text-indigo-400" />
                Gemini Advisory Output
              </h4>
              <div className="text-xs text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                {/* Parse lines of markdown into standard HTML */}
                {aiRecommendation.split("\n").map((line, lIdx) => {
                  if (line.startsWith("###")) {
                    return <h4 key={lIdx} className="text-xs font-bold text-slate-200 mt-4 mb-2 uppercase tracking-wide">{line.replace("###", "")}</h4>;
                  }
                  if (line.startsWith("##")) {
                    return <h3 key={lIdx} className="text-sm font-bold text-white mt-4 mb-2 uppercase tracking-wide">{line.replace("##", "")}</h3>;
                  }
                  if (line.startsWith("-") || line.startsWith("*")) {
                    return <li key={lIdx} className="ml-4 list-disc my-1 text-slate-300">{line.substring(2)}</li>;
                  }
                  if (line.trim().length === 0) return <div key={lIdx} className="h-2" />;
                  return <p key={lIdx} className="my-1.5 text-slate-300">{line}</p>;
                })}
              </div>
            </div>
          ) : (
            !aiLoading && (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded bg-slate-950">
                <BrainCircuit className="h-7 w-7 text-slate-700 mx-auto mb-1.5" />
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">AI Advisory Report Pending</p>
                {aggregatedStats.length === 0 && (
                  <p className="text-[10px] text-amber-500/80 font-mono mt-1">Note: Telemetry roster must contain logged scores.</p>
                )}
              </div>
            )
          )}
        </div>

        {/* Right Column: Head-to-Head Comparison */}
        <div className="space-y-6">
          <div className="p-5 bg-slate-950/40 rounded border border-slate-800">
            <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <ArrowLeftRight className="h-4.5 w-4.5 text-slate-400" />
              Scout Head-to-Head Comparison
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-mono">
              Choose two active teams to compare performance averages side by side instantly.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono">Team A</label>
                <select
                  value={compareTeam1}
                  onChange={(e) => setCompareTeam1(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Choose Team A --</option>
                  {aggregatedStats.map((t) => (
                    <option key={t.teamNumber} value={t.teamNumber}>
                      Team {t.teamNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono">Team B</label>
                <select
                  value={compareTeam2}
                  onChange={(e) => setCompareTeam2(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Choose Team B --</option>
                  {aggregatedStats.map((t) => (
                    <option key={t.teamNumber} value={t.teamNumber}>
                      Team {t.teamNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comparison Table */}
            {team1Info && team2Info ? (
              <div className="bg-slate-950 rounded border border-slate-800 overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800">
                      <th className="p-2 text-left font-bold text-slate-400 uppercase font-mono text-[10px]">Metric</th>
                      <th className="p-2 text-center font-bold text-indigo-400 bg-indigo-950/20 font-mono text-[10px]">#{team1Info.teamNumber}</th>
                      <th className="p-2 text-center font-bold text-emerald-400 bg-emerald-950/20 font-mono text-[10px]">#{team2Info.teamNumber}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-900">
                      <td className="p-2 text-slate-400">Auto exit rate</td>
                      <td className="p-2 text-center font-mono text-slate-200">{team1Info.autoDriveRate}%</td>
                      <td className="p-2 text-center font-mono text-slate-200">{team2Info.autoDriveRate}%</td>
                    </tr>
                    <tr className="border-b border-slate-900">
                      <td className="p-2 text-slate-400">Avg Auto elements</td>
                      <td className="p-2 text-center font-bold font-mono text-indigo-400 bg-indigo-950/5">{team1Info.avgAutoScored}</td>
                      <td className="p-2 text-center font-bold font-mono text-emerald-400 bg-emerald-950/5">{team2Info.avgAutoScored}</td>
                    </tr>
                    <tr className="border-b border-slate-900">
                      <td className="p-2 text-slate-400">Avg Teleop elements</td>
                      <td className="p-2 text-center font-bold font-mono text-indigo-400 bg-indigo-950/5">{team1Info.avgTeleopScored}</td>
                      <td className="p-2 text-center font-bold font-mono text-emerald-400 bg-emerald-950/5">{team2Info.avgTeleopScored}</td>
                    </tr>
                    
                    {/* Game specific custom metrics comparison */}
                    {selectedEvent.customFields.map((field) => {
                      const v1 = team1Info.customAverages[field.id];
                      const v2 = team2Info.customAverages[field.id];
                      return (
                        <tr key={field.id} className="border-b border-slate-900 bg-indigo-950/10">
                          <td className="p-2 text-indigo-300 font-bold uppercase tracking-wider text-[10px]">{field.label}</td>
                          <td className="p-2 text-center font-bold font-mono text-indigo-400">{v1}</td>
                          <td className="p-2 text-center font-bold font-mono text-emerald-400">{v2}</td>
                        </tr>
                      );
                    })}

                    <tr className="border-b border-slate-900">
                      <td className="p-2 text-slate-400">Driver Skill</td>
                      <td className="p-2 text-center text-slate-200">{team1Info.avgDriverSkill} ★</td>
                      <td className="p-2 text-center text-slate-200">{team2Info.avgDriverSkill} ★</td>
                    </tr>
                    <tr className="border-b border-slate-900">
                      <td className="p-2 text-slate-400">Reliability Index</td>
                      <td className="p-2 text-center text-slate-200">{team1Info.avgReliability} / 5</td>
                      <td className="p-2 text-center text-slate-200">{team2Info.avgReliability} / 5</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-slate-800 bg-slate-950 rounded">
                <Users2 className="h-6 w-6 text-slate-700 mx-auto mb-1" />
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Select two active teams above to simulate head-to-head metrics.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

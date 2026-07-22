import React, { useState, useEffect } from "react";
import { collection, getDocs, deleteDoc, doc, query, where, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScoutingEvent, ScoutLog } from "../types";
import { History, Trash2, CalendarRange, Filter, Star, Check, X, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import FieldDrawer from "./FieldDrawer";

interface ScoutingHistoryProps {
  selectedEvent: ScoutingEvent;
  refreshTrigger: number;
  onHistoryUpdated: () => void;
}

export default function ScoutingHistory({ selectedEvent, refreshTrigger, onHistoryUpdated }: ScoutingHistoryProps) {
  const [logs, setLogs] = useState<ScoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [selectedEvent.id, refreshTrigger]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const logsRef = collection(db, "scout_logs");
      const q = query(
        logsRef,
        where("eventId", "==", selectedEvent.id),
        orderBy("createdAt", "desc")
      );
      
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, "scout_logs");
        return;
      }
      
      const fetchedLogs: ScoutLog[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        fetchedLogs.push({
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
          autoPathPoints: d.autoPathPoints || [],
        });
      });
      setLogs(fetchedLogs);
    } catch (err) {
      console.error("Error fetching scout logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      try {
        await deleteDoc(doc(db, "scout_logs", logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `scout_logs/${logId}`);
        return;
      }
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      onHistoryUpdated();
      setDeleteConfirmLogId(null);
    } catch (error) {
      console.error("Error deleting log:", error);
    }
  };

  const uniqueTeams = Array.from(new Set(logs.map((l) => l.teamNumber))).sort((a: string, b: string) => parseInt(a) - parseInt(b));

  const filteredLogs = logs.filter((log) => {
    if (selectedTeamFilter && log.teamNumber !== selectedTeamFilter) return false;
    return true;
  });

  const toggleExpandLog = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const renderStars = (num: number) => {
    return (
      <div className="flex gap-0.5 text-amber-500">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${star <= num ? "fill-current" : "text-slate-800"}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-md">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-400" />
            Scouting History Logs
          </h2>
          <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
            Review logged sheets for <span className="font-semibold text-slate-300">{selectedEvent.name}</span>
          </p>
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={selectedTeamFilter}
            onChange={(e) => setSelectedTeamFilter(e.target.value)}
            className="px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Teams ({uniqueTeams.length})</option>
            {uniqueTeams.map((teamNum) => (
              <option key={teamNum} value={teamNum}>
                Team {teamNum}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 bg-slate-950 border border-dashed border-slate-800 rounded">
          <ShieldAlert className="h-8 w-8 text-slate-500 mx-auto mb-2" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400">No scouting logs found</p>
          <p className="text-[10px] text-slate-600 font-mono mt-1">
            {selectedTeamFilter ? "No records match this team filter." : "Get started by adding match records in the Scout Form tab!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div
                key={log.id}
                onClick={() => toggleExpandLog(log.id)}
                className={`border rounded transition duration-200 cursor-pointer overflow-hidden ${
                  isExpanded
                    ? "bg-slate-950 border-slate-700 text-slate-200"
                    : "bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40 text-slate-300"
                }`}
              >
                {/* Header Row */}
                <div className="flex justify-between items-center p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-indigo-950 text-indigo-400 border border-indigo-800/60 rounded">
                      Team {log.teamNumber}
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      {log.scoutType === "pit" ? "Pit Assessment" : `Match ${log.matchNumber}`}
                    </span>
                    <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono">
                      Scout: {log.scoutName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex gap-4 font-mono text-[11px] mr-4 hidden md:flex uppercase tracking-wider">
                      <span className="text-slate-400">
                        Auto: <strong className="text-indigo-400">{log.autoScoredCount}</strong>
                      </span>
                      <span className="text-slate-400">
                        Teleop: <strong className="text-emerald-400">{log.teleopScoredCount}</strong>
                      </span>
                    </div>

                    {deleteConfirmLogId === log.id ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLog(log.id);
                          }}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded uppercase tracking-wider transition duration-150"
                          title="Confirm Delete"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmLogId(null);
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded uppercase tracking-wider transition duration-150"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmLogId(log.id);
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded transition shrink-0"
                        title="Delete Entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-800 p-5 bg-slate-950 space-y-4 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Autonomous Review */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1 font-mono">Autonomous Actions</h4>
                        <div className="space-y-1 text-xs">
                          {selectedEvent.presetId !== "decode" && (
                            <>
                              <div className="flex justify-between py-1 border-b border-slate-900">
                                <span className="text-slate-500">Drove out of start zone:</span>
                                <span className="font-semibold flex items-center gap-0.5">
                                  {log.autoDrive ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
                                </span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-slate-900">
                                <span className="text-slate-500">Agnostic pieces scored:</span>
                                <span className="font-semibold text-slate-300">{log.autoScoredCount}</span>
                              </div>
                            </>
                          )}
                          
                          {/* Game Specific Auto */}
                          {selectedEvent.customFields.filter(f => f.section === "auto").map((field) => {
                            const val = log.gameSpecificValues[field.id];
                            return (
                              <div key={field.id} className="flex justify-between py-1 border-b border-slate-900">
                                <span className="text-slate-500">{field.label}:</span>
                                <span className="font-semibold text-indigo-400">
                                  {typeof val === "boolean" ? (val ? "Yes" : "No") : (val !== undefined ? String(val) : "None")}
                                </span>
                              </div>
                            );
                          })}

                          {/* Path Map Preview */}
                          {log.autoPathPoints && log.autoPathPoints.length > 0 && (
                            <div className="pt-3 mt-1.5 border-t border-slate-900/60">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block mb-1.5">Drawn Path Map</span>
                              <div className="flex justify-center bg-slate-950 p-1 border border-slate-900 rounded-lg">
                                <FieldDrawer points={log.autoPathPoints} onChange={() => {}} readOnly={true} size={180} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Teleop Review */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1 font-mono">Teleop Actions</h4>
                        <div className="space-y-1 text-xs">
                          {selectedEvent.presetId !== "decode" && (
                            <div className="flex justify-between py-1 border-b border-slate-900">
                              <span className="text-slate-500">Agnostic pieces scored:</span>
                              <span className="font-semibold text-slate-300">{log.teleopScoredCount}</span>
                            </div>
                          )}

                          {/* Game Specific Teleop */}
                          {selectedEvent.customFields.filter(f => f.section === "teleop").map((field) => {
                            const val = log.gameSpecificValues[field.id];
                            return (
                              <div key={field.id} className="flex justify-between py-1 border-b border-slate-900">
                                <span className="text-slate-500">{field.label}:</span>
                                <span className="font-semibold text-indigo-400">
                                  {typeof val === "boolean" ? (val ? "Yes" : "No") : (val !== undefined ? String(val) : "None")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Endgame / Style Review */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1 font-mono">Endgame & Playstyle</h4>
                        <div className="space-y-1.5 text-xs">
                          {/* Game Specific Endgame */}
                          {selectedEvent.customFields.filter(f => f.section === "endgame").map((field) => {
                            const val = log.gameSpecificValues[field.id];
                            return (
                              <div key={field.id} className="flex justify-between py-1 border-b border-slate-900">
                                <span className="text-slate-500">{field.label}:</span>
                                <span className="font-semibold text-indigo-400">
                                  {typeof val === "boolean" ? (val ? "Yes" : "No") : (val !== undefined ? String(val) : "None")}
                                </span>
                              </div>
                            );
                          })}

                          <div className="flex justify-between py-1 border-b border-slate-900 items-center">
                            <span className="text-slate-500">Defense play:</span>
                            <span>{renderStars(log.defenseRating)}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-900 items-center">
                            <span className="text-slate-500">Driver talent:</span>
                            <span>{renderStars(log.driverSkill)}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-900 items-center">
                            <span className="text-slate-500">Reliability:</span>
                            <span>{renderStars(log.reliability)}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-900 items-center">
                            <span className="text-slate-500">Cooperation:</span>
                            <span>{renderStars(log.cooperation)}</span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Qualitative Notes Review */}
                    {log.notes && (
                      <div className="p-3 bg-slate-900 rounded border border-slate-800 text-slate-300">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1 font-mono tracking-wider">Qualitative Observations</span>
                        <p className="text-xs text-slate-300 italic">"{log.notes}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

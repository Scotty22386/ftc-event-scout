import React, { useState, useEffect } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScoutingEvent, FTCTeam, ScoutLog } from "../types";
import { FileSpreadsheet, Plus, Minus, Check, Star, Play, CircleAlert, ArrowLeft } from "lucide-react";
import FieldDrawer from "./FieldDrawer";

interface ScoutFormProps {
  selectedEvent: ScoutingEvent;
  teams: FTCTeam[];
  onScoutSaved: (keepScouting: boolean) => void;
  initialTeamNum?: string;
  onCancel?: () => void;
}

export default function ScoutForm({ selectedEvent, teams, onScoutSaved, initialTeamNum = "", onCancel }: ScoutFormProps) {
  const [scoutName, setScoutName] = useState("");
  const [selectedTeamNum, setSelectedTeamNum] = useState(initialTeamNum);
  const [matchNumber, setMatchNumber] = useState("");
  const [scoutType, setScoutType] = useState<"match" | "pit">("match");
  const [keepScouting, setKeepScouting] = useState(true);

  // Sync initialTeamNum when changed from parent
  useEffect(() => {
    if (initialTeamNum) {
      setSelectedTeamNum(initialTeamNum);
    }
  }, [initialTeamNum]);
  
  // Generic Metrics States
  const [autoDrive, setAutoDrive] = useState(false);
  const [autoScoredCount, setAutoScoredCount] = useState(0);
  const [teleopScoredCount, setTeleopScoredCount] = useState(0);
  const [defenseRating, setDefenseRating] = useState(3);
  const [driverSkill, setDriverSkill] = useState(3);
  const [reliability, setReliability] = useState(3);
  const [cooperation, setCooperation] = useState(3);
  const [notes, setNotes] = useState("");
  const [autoPathPoints, setAutoPathPoints] = useState<Array<{ x: number; y: number }>>([]);

  // Game Specific Dynamic Values
  const [gameSpecificValues, setGameSpecificValues] = useState<Record<string, any>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Initialize game specific fields state when event customFields changes
  useEffect(() => {
    const initialVals: Record<string, any> = {};
    selectedEvent.customFields.forEach((field) => {
      initialVals[field.id] = field.defaultValue !== undefined ? field.defaultValue : (field.type === "number" ? 0 : field.type === "boolean" ? false : "");
    });
    setGameSpecificValues(initialVals);
  }, [selectedEvent.id, selectedEvent.customFields]);

  // Handle dynamic input changes
  const handleGameSpecificChange = (id: string, val: any) => {
    setGameSpecificValues((prev) => ({
      ...prev,
      [id]: val,
    }));
  };

  const handleRatingClick = (type: "defense" | "driver" | "reliability" | "coop", rating: number) => {
    if (type === "defense") setDefenseRating(rating);
    if (type === "driver") setDriverSkill(rating);
    if (type === "reliability") setReliability(rating);
    if (type === "coop") setCooperation(rating);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccess(false);

    if (!scoutName.trim()) {
      setErrorMsg("Please enter the scout name.");
      return;
    }
    if (!selectedTeamNum) {
      setErrorMsg("Please select a team.");
      return;
    }
    if (scoutType === "match" && !matchNumber.trim()) {
      setErrorMsg("Please specify the match number.");
      return;
    }

    try {
      let computedAutoDrive = autoDrive;
      let computedAutoScored = autoScoredCount;
      let computedTeleopScored = teleopScoredCount;

      if (selectedEvent.presetId === "decode") {
        computedAutoScored = Number(gameSpecificValues.autoCloseScored || 0) + Number(gameSpecificValues.autoFarScored || 0);
        computedTeleopScored = Number(gameSpecificValues.teleopCloseZoneScore || 0) + Number(gameSpecificValues.teleopAutoScore || 0);
        computedAutoDrive = !!(gameSpecificValues.autoCloseAuto || gameSpecificValues.autoFarAuto || gameSpecificValues.autoLeavePoints);
      }

      const logData: Omit<ScoutLog, "id"> = {
        eventId: selectedEvent.id,
        teamNumber: selectedTeamNum,
        scoutName: scoutName.trim(),
        matchNumber: scoutType === "match" ? matchNumber.trim() : "PIT",
        scoutType,
        createdAt: Date.now(),
        
        // Reusable generic metrics
        autoDrive: computedAutoDrive,
        autoScoredCount: computedAutoScored,
        teleopScoredCount: computedTeleopScored,
        defenseRating,
        driverSkill,
        reliability,
        cooperation,
        notes: notes.trim(),
        
        // Dynamic game specific metrics
        gameSpecificValues,
        autoPathPoints,
      };

      try {
        await addDoc(collection(db, "scout_logs"), logData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "scout_logs");
        return;
      }

      setSuccess(true);
      
      // Auto increment match number (e.g. Q-1 to Q-2)
      if (scoutType === "match" && matchNumber.startsWith("Q-")) {
        const parts = matchNumber.split("-");
        const nextNum = parseInt(parts[1]);
        if (!isNaN(nextNum)) {
          setMatchNumber(`Q-${nextNum + 1}`);
        }
      } else if (scoutType === "match" && /^\d+$/.test(matchNumber)) {
        const nextNum = parseInt(matchNumber);
        setMatchNumber(String(nextNum + 1));
      } else {
        setMatchNumber("");
      }

      // Reset form states but keep scout name for continuous scouting
      setSelectedTeamNum("");
      setAutoDrive(false);
      setAutoScoredCount(0);
      setTeleopScoredCount(0);
      setDefenseRating(3);
      setDriverSkill(3);
      setReliability(3);
      setCooperation(3);
      setNotes("");
      setAutoPathPoints([]);

      // Re-initialize dynamic values
      const initialVals: Record<string, any> = {};
      selectedEvent.customFields.forEach((field) => {
        initialVals[field.id] = field.defaultValue !== undefined ? field.defaultValue : (field.type === "number" ? 0 : field.type === "boolean" ? false : "");
      });
      setGameSpecificValues(initialVals);

      onScoutSaved(keepScouting);

      setTimeout(() => {
        setSuccess(false);
      }, 3000);

    } catch (err: any) {
      console.error("Error saving scout log:", err);
      setErrorMsg("Failed to save scouting record. Please try again.");
    }
  };

  // Group fields by section for rendering
  const autoFields = selectedEvent.customFields.filter((f) => f.section === "auto");
  const teleopFields = selectedEvent.customFields.filter((f) => f.section === "teleop");
  const endgameFields = selectedEvent.customFields.filter((f) => f.section === "endgame");

  const RatingButtons = ({ current, type }: { current: number; type: "defense" | "driver" | "reliability" | "coop" }) => {
    return (
      <div className="flex gap-1 mt-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleRatingClick(type, star)}
            className={`p-1 rounded transition ${star <= current ? "text-amber-500" : "text-slate-700 hover:text-slate-600"}`}
          >
            <Star className="h-4 w-4 fill-current" />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-md">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
            Active Scout Log Sheet
          </h2>
          <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
            Perform a live scouting assessment for teams at <span className="font-semibold text-slate-300">{selectedEvent.name}</span>
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold font-mono border border-slate-700 transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-indigo-400" />
            Go Back
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-10 bg-slate-950 rounded border border-dashed border-slate-800">
          <CircleAlert className="h-7 w-7 text-amber-500 mx-auto mb-2" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400">Roster Empty</p>
          <p className="text-[10px] text-slate-600 font-mono mt-1">Add some teams under the Registered Teams tab first.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Top Metadata Segment */}
          <div className="p-4 bg-slate-950 rounded border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1">Scout Name</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={scoutName}
                onChange={(e) => setScoutName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1">Scout Target Team</label>
              <select
                value={selectedTeamNum}
                onChange={(e) => setSelectedTeamNum(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="">-- Choose Team --</option>
                {teams.map((t) => (
                  <option key={t.teamNumber} value={t.teamNumber}>
                    {t.teamNumber} - {t.teamName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1">Scouting Mode</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-700 rounded">
                <button
                  type="button"
                  onClick={() => setScoutType("match")}
                  className={`py-1 text-[10px] font-bold rounded uppercase tracking-wider transition ${
                    scoutType === "match" ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Match
                </button>
                <button
                  type="button"
                  onClick={() => setScoutType("pit")}
                  className={`py-1 text-[10px] font-bold rounded uppercase tracking-wider transition ${
                    scoutType === "pit" ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Pit / Prac
                </button>
              </div>
            </div>

            {scoutType === "match" ? (
              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-1">Match #</label>
                <input
                  type="text"
                  placeholder="e.g. Q-1 or 12"
                  value={matchNumber}
                  onChange={(e) => setMatchNumber(e.target.value)}
                  required={scoutType === "match"}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
            ) : (
              <div className="opacity-40">
                <label className="block text-[10px] text-slate-400 uppercase mb-1">Match #</label>
                <input
                  type="text"
                  value="PIT SCOUTING"
                  disabled
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-slate-500 rounded text-xs font-bold uppercase tracking-wider"
                />
              </div>
            )}
          </div>

          {/* Core Reusable/Generic Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Autonomous */}
            <div className="p-4 bg-slate-950/40 rounded border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Play className="h-3.5 w-3.5 text-indigo-400 rotate-90" />
                {selectedEvent.presetId === "decode" ? "Autonomous Metrics" : "Generic Auto Metrics"}
              </h3>
              
              {selectedEvent.presetId !== "decode" && (
                <>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-850 rounded">
                    <div>
                      <span className="text-xs font-bold text-slate-200">Drove / Navigated?</span>
                      <p className="text-[10px] text-slate-500 font-mono">Exit starting tile?</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoDrive}
                      onChange={(e) => setAutoDrive(e.target.checked)}
                      className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-850 rounded">
                    <div>
                      <span className="text-xs font-bold text-slate-200">Auto Items Scored</span>
                      <p className="text-[10px] text-slate-500 font-mono">Total scored elements</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAutoScoredCount(Math.max(0, autoScoredCount - 1))}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="font-mono text-xs font-bold w-6 text-center text-slate-200">{autoScoredCount}</span>
                      <button
                        type="button"
                        onClick={() => setAutoScoredCount(autoScoredCount + 1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Dynamic Game Specific fields for Auto */}
              {autoFields.map((field) => (
                <div key={field.id} className="p-2.5 bg-indigo-950/20 rounded border border-indigo-900/30 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-indigo-300">{field.label}</span>
                    </div>
                    {field.type === "boolean" && (
                      <input
                        type="checkbox"
                        checked={!!gameSpecificValues[field.id]}
                        onChange={(e) => handleGameSpecificChange(field.id, e.target.checked)}
                        className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                      />
                    )}
                    {field.type === "number" && (
                      <div className="flex items-center gap-2">
                        <button
                           type="button"
                           onClick={() => handleGameSpecificChange(field.id, Math.max(0, (gameSpecificValues[field.id] || 0) - 1))}
                           className="p-1 rounded bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 transition"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono text-xs font-bold w-6 text-center text-indigo-200">
                          {gameSpecificValues[field.id] || 0}
                        </span>
                        <button
                           type="button"
                           onClick={() => handleGameSpecificChange(field.id, (gameSpecificValues[field.id] || 0) + 1)}
                           className="p-1 rounded bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 transition"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {field.type === "select" && (
                    <select
                      value={gameSpecificValues[field.id] || ""}
                      onChange={(e) => handleGameSpecificChange(field.id, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select option</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={gameSpecificValues[field.id] || ""}
                      onChange={(e) => handleGameSpecificChange(field.id, e.target.value)}
                      placeholder="Enter notes..."
                      className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              ))}

              {/* Field Path Drawing */}
              <div className="pt-3 border-t border-slate-800/60 mt-4 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Autonomous Path Map</span>
                <FieldDrawer points={autoPathPoints} onChange={setAutoPathPoints} />
              </div>
            </div>

            {/* Teleop */}
            <div className="p-4 bg-slate-950/40 rounded border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                {selectedEvent.presetId === "decode" ? "Teleop Metrics" : "Generic Teleop Metrics"}
              </h3>

              {selectedEvent.presetId !== "decode" && (
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-850 rounded">
                  <div>
                    <span className="text-xs font-bold text-slate-200">Teleop Items Scored</span>
                    <p className="text-[10px] text-slate-500 font-mono">General elements placed</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTeleopScoredCount(Math.max(0, teleopScoredCount - 1))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="font-mono text-xs font-bold w-6 text-center text-slate-200">{teleopScoredCount}</span>
                    <button
                      type="button"
                      onClick={() => setTeleopScoredCount(teleopScoredCount + 1)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Game Specific fields for Teleop */}
              {teleopFields.map((field) => (
                <div key={field.id} className="p-2.5 bg-indigo-950/20 rounded border border-indigo-900/30 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-indigo-300">{field.label}</span>
                    </div>
                    {field.type === "boolean" && (
                      <input
                        type="checkbox"
                        checked={!!gameSpecificValues[field.id]}
                        onChange={(e) => handleGameSpecificChange(field.id, e.target.checked)}
                        className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                      />
                    )}
                    {field.type === "number" && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGameSpecificChange(field.id, Math.max(0, (gameSpecificValues[field.id] || 0) - 1))}
                          className="p-1 rounded bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 transition"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono text-xs font-bold w-6 text-center text-indigo-200">
                          {gameSpecificValues[field.id] || 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGameSpecificChange(field.id, (gameSpecificValues[field.id] || 0) + 1)}
                          className="p-1 rounded bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 transition"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {field.type === "select" && (
                    <select
                      value={gameSpecificValues[field.id] || ""}
                      onChange={(e) => handleGameSpecificChange(field.id, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select option</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={gameSpecificValues[field.id] || ""}
                      onChange={(e) => handleGameSpecificChange(field.id, e.target.value)}
                      placeholder="Enter notes..."
                      className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Endgame & Driver Skill */}
            <div className="p-4 bg-slate-950/40 rounded border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Play className="h-3.5 w-3.5 text-amber-400 -rotate-90" />
                Endgame & Playstyle
              </h3>

              {/* Dynamic Game Specific fields for Endgame */}
              {endgameFields.map((field) => (
                <div key={field.id} className="p-2.5 bg-indigo-950/20 rounded border border-indigo-900/30 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-indigo-300">{field.label}</span>
                    </div>
                    {field.type === "boolean" && (
                      <input
                        type="checkbox"
                        checked={!!gameSpecificValues[field.id]}
                        onChange={(e) => handleGameSpecificChange(field.id, e.target.checked)}
                        className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                      />
                    )}
                    {field.type === "number" && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGameSpecificChange(field.id, Math.max(0, (gameSpecificValues[field.id] || 0) - 1))}
                          className="p-1 rounded bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 transition"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono text-xs font-bold w-6 text-center text-indigo-200">
                          {gameSpecificValues[field.id] || 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGameSpecificChange(field.id, (gameSpecificValues[field.id] || 0) + 1)}
                          className="p-1 rounded bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 transition"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {field.type === "select" && (
                    <select
                      value={gameSpecificValues[field.id] || ""}
                      onChange={(e) => handleGameSpecificChange(field.id, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select option</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={gameSpecificValues[field.id] || ""}
                      onChange={(e) => handleGameSpecificChange(field.id, e.target.value)}
                      placeholder="Enter notes..."
                      className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              ))}

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Defense Rating</span>
                  <RatingButtons current={defenseRating} type="defense" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Driver Skill</span>
                  <RatingButtons current={driverSkill} type="driver" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Reliability</span>
                  <RatingButtons current={reliability} type="reliability" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Cooperation</span>
                  <RatingButtons current={cooperation} type="coop" />
                </div>
              </div>
            </div>
          </div>

          {/* Qualitative Notes Section */}
          <div className="p-4 bg-slate-950 rounded border border-slate-800">
            <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
              Qualitative Scouting Notes / Drive Observations
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Highly consistent driver. Robot had minor battery terminal issue in end game but auto was flawless. Defended well against high scorers."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Action buttons & notices */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-t border-slate-800 pt-4">
            <div className="flex-1 space-y-1">
              {errorMsg && (
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                  <CircleAlert className="h-4 w-4" /> {errorMsg}
                </p>
              )}
              {success && (
                <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1 animate-pulse">
                  <Check className="h-4 w-4" /> Log Sheet saved successfully! Ready for next match.
                </p>
              )}
              {!errorMsg && !success && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="keepScouting"
                    checked={keepScouting}
                    onChange={(e) => setKeepScouting(e.target.checked)}
                    className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="keepScouting" className="text-xs text-slate-400 font-medium cursor-pointer select-none">
                    Stay on scout sheet tab to log multiple runs
                  </label>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition shadow-md"
            >
              <Check className="h-4 w-4" />
              Save Scouting Log Sheet
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

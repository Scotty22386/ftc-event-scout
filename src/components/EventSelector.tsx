import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScoutingEvent, GAME_PRESETS, ScoutingFieldConfig } from "../types";
import { Calendar, Plus, Trash2, ShieldAlert, Layers, ChevronRight, Settings, Loader2, Info, ArrowRight, Check, Play, Clock, Sparkles } from "lucide-react";

interface EventSelectorProps {
  selectedEvent: ScoutingEvent | null;
  onSelectEvent: (event: ScoutingEvent | null) => void;
  loggedInTeam: { teamNumber: string; teamName: string; season: number } | null;
  teamEvents: any[];
  loadingTeamEvents: boolean;
  teamEventsError: string | null;
  teamEventsIsAllEvents: boolean;
}

export default function EventSelector({
  selectedEvent,
  onSelectEvent,
  loggedInTeam,
  teamEvents,
  loadingTeamEvents,
  teamEventsError,
  teamEventsIsAllEvents,
}: EventSelectorProps) {
  const [events, setEvents] = useState<ScoutingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // New Event State
  const [name, setName] = useState("");
  const [season, setSeason] = useState("2025-2026");
  const [gameName, setGameName] = useState("DECODE");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [presetId, setPresetId] = useState("decode");
  
  // Custom field builder state
  const [customFields, setCustomFields] = useState<ScoutingFieldConfig[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"number" | "boolean" | "text" | "select">("number");
  const [newFieldSection, setNewFieldSection] = useState<"auto" | "teleop" | "endgame">("auto");
  const [newFieldOptions, setNewFieldOptions] = useState("");

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const eventsRef = collection(db, "events");
      const q = query(eventsRef, orderBy("createdAt", "desc"));
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, "events");
        return;
      }
      
      const fetchedEvents: ScoutingEvent[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const latestPresetFields = data.presetId === "decode" ? (GAME_PRESETS.find(p => p.id === "decode")?.fields || []) : null;
        fetchedEvents.push({
          id: doc.id,
          name: data.name,
          date: data.date,
          season: data.season,
          gameName: data.gameName,
          presetId: data.presetId,
          customFields: latestPresetFields || data.customFields || [],
          createdAt: data.createdAt,
        });
      });
      
      setEvents(fetchedEvents);
      
      // Auto-select first event if none selected AND we have a selected event session stored or wanted (avoid forcing on mount if user prefers to see schedule)
      // We will only auto-select on mount if no active selectedEvent state but we don't force it to allow schedule browsing.
      // Actually, if they logged in, we want them to see the landing page to select their event.
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomField = () => {
    if (!newFieldLabel.trim()) return;
    
    const fieldId = "custom_" + newFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const optionsArray = newFieldOptions
      ? newFieldOptions.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
      : undefined;

    const newField: ScoutingFieldConfig = {
      id: fieldId,
      label: newFieldLabel.trim(),
      type: newFieldType,
      section: newFieldSection,
      options: optionsArray,
      defaultValue: newFieldType === "number" ? 0 : newFieldType === "boolean" ? false : "",
    };

    setCustomFields([...customFields, newField]);
    setNewFieldLabel("");
    setNewFieldOptions("");
  };

  const handleRemoveCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handlePresetChange = (pId: string) => {
    setPresetId(pId);
    if (pId !== "custom") {
      const selectedPreset = GAME_PRESETS.find((p) => p.id === pId);
      if (selectedPreset) {
        setGameName(selectedPreset.gameName);
        setSeason(selectedPreset.season);
        setCustomFields(selectedPreset.fields);
      }
    } else {
      setGameName("Custom Competition Game");
      setCustomFields([]);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      let finalFields = [...customFields];
      if (presetId !== "custom" && finalFields.length === 0) {
        const selectedPreset = GAME_PRESETS.find((p) => p.id === presetId);
        if (selectedPreset) {
          finalFields = selectedPreset.fields;
        }
      }

      const newEventData = {
        name: name.trim(),
        season,
        gameName,
        date,
        presetId,
        customFields: finalFields,
        createdAt: Date.now(),
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, "events"), newEventData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "events");
        return;
      }
      
      const createdEvent: ScoutingEvent = {
        id: docRef.id,
        ...newEventData,
      };

      const updatedEvents = [createdEvent, ...events];
      setEvents(updatedEvents);
      onSelectEvent(createdEvent);
      setShowCreateForm(false);
      
      // Reset form
      setName("");
      setPresetId("decode");
      setCustomFields([]);
    } catch (error) {
      console.error("Error creating event:", error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      try {
        await deleteDoc(doc(db, "events", eventId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `events/${eventId}`);
        return;
      }
      const updatedEvents = events.filter((evt) => evt.id !== eventId);
      setEvents(updatedEvents);
      
      if (selectedEvent?.id === eventId) {
        onSelectEvent(updatedEvents.length > 0 ? updatedEvents[0] : null);
      }
      setDeleteConfirmId(null);
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleSelectTeamEvent = async (evt: { code: string; name: string; region: string }) => {
    try {
      const eventDocRef = doc(db, "events", evt.code);
      
      let eventSnap;
      try {
        eventSnap = await getDoc(eventDocRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `events/${evt.code}`);
        return;
      }

      let finalEvent: ScoutingEvent;

      if (eventSnap.exists()) {
        const data = eventSnap.data();
        const latestPresetFields = data.presetId === "decode" ? (GAME_PRESETS.find(p => p.id === "decode")?.fields || []) : null;
        finalEvent = {
          id: eventSnap.id,
          name: data.name,
          date: data.date,
          season: data.season,
          gameName: data.gameName,
          presetId: data.presetId,
          customFields: latestPresetFields || data.customFields || [],
          createdAt: data.createdAt
        };
      } else {
        // Auto-provision if not exists
        let presetId = "decode"; // Default to current season
        let gameName = "DECODE";
        let season = "2025-2026";

        if (loggedInTeam?.season) {
          // Find matching preset
          const matchingPreset = GAME_PRESETS.find(p => p.season.includes(String(loggedInTeam.season)));
          if (matchingPreset) {
            presetId = matchingPreset.id;
            gameName = matchingPreset.gameName;
            season = matchingPreset.season;
          }
        }

        const presetFields = GAME_PRESETS.find(p => p.id === presetId)?.fields || [];

        finalEvent = {
          id: evt.code,
          name: evt.name,
          date: new Date().toISOString().split("T")[0], // current date as fallback
          season: season,
          gameName: gameName,
          presetId: presetId,
          customFields: presetFields,
          createdAt: Date.now()
        };

        try {
          await setDoc(eventDocRef, finalEvent);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `events/${evt.code}`);
          return;
        }
      }

      onSelectEvent(finalEvent);
      // Refresh events list to include newly created one in cache
      fetchEvents();
    } catch (err) {
      console.error("Error setting team event:", err);
    }
  };

  // If an active event is selected, keep it ultra-clean and hide the selection dashboard.
  // The selected event banner inside App.tsx is already responsible for displaying active state.
  if (selectedEvent) {
    return null;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Scouting Operations Title */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
            <Layers className="h-5.5 w-5.5 text-indigo-400" />
            Scouting Operations Center
          </h2>
          <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
            Pick a pre-existing scouting campaign or launch a fresh live event below
          </p>
        </div>
        
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            if (!showCreateForm) handlePresetChange("decode");
          }}
          className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded uppercase tracking-wider transition self-start md:self-auto cursor-pointer shadow-lg shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Create Custom Event
        </button>
      </div>

      {/* Creation form when active */}
      {showCreateForm && (
        <form onSubmit={handleCreateEvent} className="p-6 bg-slate-900 rounded-xl border border-indigo-500/20 shadow-xl animate-in fade-in slide-in-from-top duration-200">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-5 flex items-center gap-1.5">
            <Settings className="h-4 w-4 text-indigo-400" />
            Configure Custom Event & Game Rules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono tracking-wider">Event Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NYC Regional Championship"
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono tracking-wider">Event Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono tracking-wider">Game Specific Preset</label>
              <select
                value={presetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
              >
                <option value="decode">FIRST DECODE (2025-26)</option>
                <option value="into-the-deep">Into the Deep (2024-25)</option>
                <option value="centerstage">Centerstage (2023-24)</option>
                <option value="generic-game">Generic Game (Agnostic)</option>
                <option value="custom">Custom (Create Custom Fields)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono tracking-wider">Game Name</label>
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                disabled={presetId !== "custom"}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-sm disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1 font-mono tracking-wider">Season Year</label>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                disabled={presetId !== "custom"}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-sm disabled:opacity-40"
              />
            </div>
          </div>

          {/* Custom field builder */}
          <div className="mt-4 p-4 bg-slate-950 rounded border border-slate-800">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center justify-between">
              <span>GAME SPECIFIC FIELDS ({customFields.length})</span>
              {presetId !== "custom" && <span className="text-[9px] text-slate-500 font-mono tracking-wider">PRE-FILLED FROM PRESET</span>}
            </h4>

            {customFields.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {customFields.map((field, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-indigo-950/30 text-indigo-300 border border-indigo-800"
                  >
                    <span className="opacity-60 text-[9px] font-mono uppercase">[{field.section}]</span> {field.label} ({field.type})
                    {(presetId === "custom") && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomField(idx)}
                        className="hover:bg-indigo-900 p-0.5 rounded-full"
                      >
                        <Trash2 className="h-3 w-3 text-indigo-400 hover:text-red-400" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {presetId === "custom" && (
              <div className="p-3.5 bg-slate-900 rounded border border-dashed border-slate-800">
                <p className="text-[11px] text-slate-500 mb-3 font-mono">Add infinite custom fields to track for any new game season dynamically!</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Field Label / Metric Name</label>
                    <input
                      type="text"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="e.g. Alliance Hub High Level"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-850 text-slate-200 rounded text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Input Type</label>
                    <select
                      value={newFieldType}
                      onChange={(e: any) => setNewFieldType(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-850 text-slate-200 rounded text-xs focus:outline-none"
                    >
                      <option value="number">Number Counter</option>
                      <option value="boolean">Checkbox (Yes/No)</option>
                      <option value="text">Text Notes</option>
                      <option value="select">Dropdown Choice</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Game Stage</label>
                    <select
                      value={newFieldSection}
                      onChange={(e: any) => setNewFieldSection(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-850 text-slate-200 rounded text-xs focus:outline-none"
                    >
                      <option value="auto">Autonomous</option>
                      <option value="teleop">Teleop</option>
                      <option value="endgame">Endgame</option>
                    </select>
                  </div>
                </div>

                {newFieldType === "select" && (
                  <div className="mt-3">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Dropdown Options (comma separated)</label>
                    <input
                      type="text"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      placeholder="e.g. High Chamber, Low Chamber, None"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-850 text-slate-200 rounded text-xs focus:outline-none"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddCustomField}
                  className="mt-3 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded uppercase tracking-wider transition flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Field Config
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 border border-slate-700 hover:border-slate-500 text-xs font-bold rounded uppercase transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded uppercase tracking-widest transition cursor-pointer"
            >
              Initialize Event
            </button>
          </div>
        </form>
      )}

      {/* SECTION 1: Pre-existing / Initialized Events take absolute precedence */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500 shadow-sm" />
            📁 Active Scouting Campaigns (Pre-existing)
          </h3>
          <span className="text-[10px] font-mono text-slate-500 uppercase bg-slate-900 border border-slate-800/80 px-2.5 py-1 rounded">
            Durable Cloud Campaigns: {events.length}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center flex flex-col items-center justify-center bg-slate-900/30 border border-slate-800 rounded-xl">
            <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mb-3" />
            <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest">Loading active database campaigns...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 px-6 text-center bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
            <ShieldAlert className="h-8 w-8 text-slate-600 mx-auto mb-3 animate-pulse" />
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">No Campaigns Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 font-mono">
              You haven't initialized any local scouting database sessions yet. Select an official competition below or configure a custom one above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {events.map((evt) => {
              const hasCustomConfig = evt.presetId === "custom";
              return (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className="group relative bg-slate-900 hover:bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-indigo-500/5 flex flex-col justify-between hover:scale-[1.01]"
                >
                  <div>
                    {/* Header line of card */}
                    <div className="flex justify-between items-start mb-3.5">
                      <span className="text-[9px] font-bold uppercase font-mono bg-indigo-950/50 text-indigo-400 border border-indigo-900/40 px-2 py-0.5 rounded-sm shrink-0">
                        {evt.gameName} ({evt.season})
                      </span>
                      {hasCustomConfig && (
                        <span className="text-[9px] font-bold uppercase font-mono bg-amber-950/40 text-amber-400 border border-amber-900/30 px-1.5 py-0.5 rounded">
                          Custom
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-white tracking-wide group-hover:text-indigo-400 transition duration-150 line-clamp-2 pr-4 leading-snug">
                      {evt.name}
                    </h4>

                    <div className="flex items-center gap-1.5 mt-3.5 text-[11px] font-mono text-slate-400">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      <span>{evt.date}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500 uppercase">{evt.id}</span>
                    </div>
                  </div>

                  {/* Actions footer inside card */}
                  <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[11px] font-bold font-mono text-indigo-400 group-hover:underline">
                      <Play className="h-3 w-3 fill-indigo-400" />
                      Enter Dashboard
                    </div>

                    {/* Delete logic with double-confirm nested securely */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      {deleteConfirmId === evt.id ? (
                        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-md animate-in fade-in scale-in duration-100">
                          <button
                            onClick={() => handleDeleteEvent(evt.id)}
                            className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold rounded uppercase font-mono transition"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-0.5 bg-slate-850 hover:bg-slate-700 text-slate-300 text-[9px] font-bold rounded uppercase font-mono transition"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(evt.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded transition"
                          title="Delete Scouting Session"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Official Season Schedule (FTC Scout API integrated) */}
      <div className="space-y-4 pt-4 border-t border-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-400" />
              Your Team's Competition Schedule
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Official registered events for Season {loggedInTeam?.season} parsed from FTC Scout GraphQL API. Click to instantly provision or enter.
            </p>
          </div>
          <div className="text-[10px] bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded font-mono font-bold text-indigo-400 flex items-center gap-1.5 self-start shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Team {loggedInTeam?.teamNumber}
          </div>
        </div>

        {loadingTeamEvents ? (
          <div className="py-16 text-center flex flex-col items-center justify-center bg-slate-900/20 border border-slate-800 rounded-xl">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Syncing schedule with FTC Scout database...</p>
          </div>
        ) : teamEventsError ? (
          <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded-lg text-xs font-mono text-amber-300 leading-relaxed">
            ⚠️ {teamEventsError}
          </div>
        ) : teamEvents.length === 0 ? (
          <div className="py-12 text-center bg-slate-900/20 border border-slate-800 rounded-xl">
            <Info className="h-10 w-10 text-slate-600 mx-auto mb-4" />
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">No Competitions Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 font-mono">
              We didn't detect any official season events registered under Team {loggedInTeam?.teamNumber} on FTC Scout for season {loggedInTeam?.season}.
            </p>
          </div>
        ) : (
          <div>
            {teamEventsIsAllEvents && (
              <div className="mb-4 p-3.5 bg-indigo-950/20 border border-indigo-900/30 text-indigo-300 rounded-lg text-xs font-mono leading-relaxed">
                ℹ️ <strong>Schema Fallback Mode:</strong> Presenting all events for Season {loggedInTeam?.season}. Click any card to provision/open telemetry logs.
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamEvents.map((evt) => {
                // Check if this event already has a configured session in Firestore
                const isAlreadyInitialized = events.some((e) => e.id === evt.code);
                
                return (
                  <div
                    key={evt.code}
                    onClick={() => handleSelectTeamEvent(evt)}
                    className={`group relative rounded-xl p-5 transition-all duration-200 cursor-pointer shadow-sm flex flex-col justify-between hover:scale-[1.01] ${
                      isAlreadyInitialized
                        ? "bg-slate-900/60 hover:bg-slate-900 border border-indigo-500/30 shadow-indigo-950/30"
                        : "bg-slate-950/40 hover:bg-slate-900/30 border border-slate-850/80 hover:border-slate-800"
                    }`}
                  >
                    <div className="absolute top-4 right-4 h-6 w-6 rounded bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:bg-indigo-600 group-hover:border-indigo-500 transition duration-150 text-slate-500 group-hover:text-white">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="text-[9px] font-bold uppercase font-mono bg-indigo-950/40 text-indigo-400 border border-indigo-900/30 px-1.5 py-0.5 rounded-sm">
                          {evt.region || "FTC"}
                        </div>
                        {isAlreadyInitialized && (
                          <div className="flex items-center gap-1 text-[9px] font-bold font-mono text-emerald-400 uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Pre-existing
                          </div>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white tracking-wide group-hover:text-indigo-400 transition duration-150 line-clamp-2 pr-6">
                        {evt.name}
                      </h3>
                    </div>
                    <div className="mt-5 pt-3.5 border-t border-slate-900/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>Code: <strong className="text-slate-400 uppercase">{evt.code}</strong></span>
                      <span className="text-indigo-500 group-hover:underline flex items-center gap-1 font-bold">
                        {isAlreadyInitialized ? "Enter Workspace" : "Scout Event"}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* OPERATIONS GUIDE PANEL */}
      <div className="text-center py-10 bg-slate-900/40 border border-slate-800/60 rounded-xl max-w-3xl mx-auto p-6 animate-in fade-in duration-300">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-4 font-mono">
          <Info className="h-4 w-4 text-indigo-400" />
          Scouting Operations Guide
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left text-xs text-slate-350">
          <div className="space-y-2 bg-slate-950/40 p-4 border border-slate-800/40 rounded-lg">
            <p className="font-bold text-slate-200">📁 Cloud-Synced Campaigns</p>
            <p className="leading-relaxed text-slate-400">
              Pre-existing campaigns are saved permanently in Firestore. They preserve your telemetry averages, team list overrides, and matching logs, persistent across all browser sessions.
            </p>
          </div>
          <div className="space-y-2 bg-slate-950/40 p-4 border border-slate-800/40 rounded-lg">
            <p className="font-bold text-slate-200">🗓️ Instant Provisioning</p>
            <p className="leading-relaxed text-slate-400">
              Select any event on your official FTC Scout schedule. If it hasn't been configured, the system will auto-initialize it with game-specific defaults based on your active season.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}

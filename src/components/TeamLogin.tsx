import React, { useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Lock, Users, Calendar, ArrowRight, ShieldCheck, Eye, EyeOff, Trophy, MapPin, Loader2 } from "lucide-react";

interface TeamLoginProps {
  onLoginSuccess: (teamInfo: { teamNumber: string; teamName: string; season: number }) => void;
}

export default function TeamLogin({ onLoginSuccess }: TeamLoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [teamNumber, setTeamNumber] = useState("");
  const [password, setPassword] = useState("");
  const [season, setSeason] = useState(2025); // default season is 2025-2026 (DECODE)
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedTeamInfo, setFetchedTeamInfo] = useState<{ name: string; cityState?: string } | null>(null);

  // Helper to fetch team name dynamically from FTC Scout as they type or on blur
  const handleTeamBlur = async () => {
    const num = teamNumber.trim();
    if (!num || isNaN(Number(num))) return;

    try {
      const queryStr = `
        query GetTeam($number: Int!) {
          teamByNumber(number: $number) {
            name
            city
            state
          }
        }
      `;
      const response = await fetch("/api/ftc-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryStr,
          variables: { number: parseInt(num) }
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        const teamObj = resJson.data?.teamByNumber;
        if (teamObj) {
          const loc = [teamObj.city, teamObj.state].filter(Boolean).join(", ");
          setFetchedTeamInfo({
            name: teamObj.name,
            cityState: loc || undefined
          });
        } else {
          setFetchedTeamInfo(null);
        }
      }
    } catch (e) {
      console.error("Error checking team name:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const num = teamNumber.trim();
    const pw = password.trim();

    if (!num) {
      setError("Please enter your team number.");
      return;
    }
    if (num !== "14596") {
      setError("Access restricted. Only Team 14596 is permitted.");
      return;
    }
    if (pw !== "xlr8ftc") {
      setError("Incorrect password.");
      return;
    }

    setLoading(true);

    try {
      const profileDocRef = doc(db, "team_profiles", num);
      
      let profileSnap;
      try {
        profileSnap = await getDoc(profileDocRef);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `team_profiles/${num}`);
        return; // unreachable if handleFirestoreError throws
      }

      let teamName = "XLR8";
      if (fetchedTeamInfo?.name) {
        teamName = fetchedTeamInfo.name;
      } else {
        // Fallback fetch if blurred fetch was skipped
        try {
          const queryStr = `
            query GetTeam($number: Int!) {
              teamByNumber(number: $number) {
                name
              }
            }
          `;
          const response = await fetch("/api/ftc-scout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: queryStr,
              variables: { number: parseInt(num) }
            }),
          });
          if (response.ok) {
            const resJson = await response.json();
            if (resJson.data?.teamByNumber?.name) {
              teamName = resJson.data.teamByNumber.name;
            }
          }
        } catch (e) {
          console.error("Backup team name fetch failed:", e);
        }
      }

      // Automatically create or update team profile in Firestore for team 14596 to ensure password is xlr8ftc
      const data = profileSnap.exists() ? profileSnap.data() : null;
      const finalTeamName = data?.teamName || teamName;
      const finalSeason = data?.season || 2025;

      try {
        await setDoc(profileDocRef, {
          teamNumber: num,
          password: pw, // Enforce xlr8ftc in DB
          season: finalSeason,
          teamName: finalTeamName,
          lastLoginAt: Date.now()
        }, { merge: true });
      } catch (e) {
        console.warn("Could not sync profile to Firestore, proceeding anyway:", e);
        // Continue anyway so the user is never blocked if there are firestore issues
      }

      onLoginSuccess({
        teamNumber: num,
        teamName: finalTeamName,
        season: finalSeason
      });
    } catch (err: any) {
      console.error("Authentication/registration error:", err);
      // If we threw a JSON error from handleFirestoreError, display its message or error details
      try {
        const parsed = JSON.parse(err.message);
        setError(`Database Error: ${parsed.error}`);
      } catch (parseEx) {
        setError(err.message || "An unexpected database error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden my-8 animate-in fade-in duration-300">
      
      {/* Decorative top gradient glow */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 bg-indigo-950 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400 mb-3 shadow-md">
          <Trophy className="h-6 w-6 animate-pulse" />
        </div>
        <h2 className="text-xl font-extrabold text-white tracking-tight uppercase flex items-center gap-2">
          Team Login Gate
        </h2>
        <p className="text-xs text-slate-400 font-mono text-center mt-1">
          Enter authorized team credentials to access the scouting operations center
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-950/40 border border-red-900/60 text-red-300 rounded-lg text-xs font-mono leading-relaxed">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Team Number */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">
            Team Number
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Users className="h-4 w-4" />
            </span>
            <input
              type="text"
              required
              placeholder="e.g. 14596"
              value={teamNumber}
              onBlur={handleTeamBlur}
              onChange={(e) => {
                setTeamNumber(e.target.value);
                setFetchedTeamInfo(null);
              }}
              disabled={loading}
              className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded text-sm text-slate-100 placeholder-slate-600 focus:outline-hidden font-mono"
            />
          </div>
          {fetchedTeamInfo && (
            <div className="mt-1.5 px-2 py-1 bg-indigo-950/40 border border-indigo-900/40 rounded flex items-center justify-between text-[11px] font-mono animate-in fade-in">
              <span className="text-indigo-300 font-semibold truncate">{fetchedTeamInfo.name}</span>
              {fetchedTeamInfo.cityState && (
                <span className="text-slate-500 flex items-center gap-1 shrink-0 ml-2">
                  <MapPin className="h-3 w-3" />
                  {fetchedTeamInfo.cityState}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">
            Access Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Lock className="h-4 w-4" />
            </span>
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded text-sm text-slate-100 placeholder-slate-600 focus:outline-hidden font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded uppercase tracking-wider text-xs transition duration-150 shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <span>Enter Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Trust & Safety Guard indicator */}
      <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        <span>Secured via FTC Scout Cloud Link</span>
      </div>
    </div>
  );
}

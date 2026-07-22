/**
 * Shared Type Definitions for FTC Event Scout & Alliance Helper
 */

export interface ScoutingFieldConfig {
  id: string;
  label: string;
  type: "number" | "boolean" | "text" | "select";
  section: "auto" | "teleop" | "endgame";
  options?: string[]; // for select dropdowns
  defaultValue?: any;
}

export interface ScoutingEvent {
  id: string;
  name: string;
  date: string;
  season: string;
  gameName: string;
  presetId: string; // e.g., 'into-the-deep' | 'custom'
  customFields: ScoutingFieldConfig[];
  createdAt: number;
}

export interface FTCTeam {
  teamNumber: string;
  teamName: string;
  schoolName?: string;
  city?: string;
  state?: string;
}

export interface ScoutLog {
  id: string;
  eventId: string;
  teamNumber: string;
  scoutName: string;
  matchNumber: string; // e.g. 'Q-3'
  scoutType: "match" | "pit";
  createdAt: number;
  
  // Reusable / Generic Metrics across seasons
  autoDrive: boolean;
  autoScoredCount: number;
  teleopScoredCount: number;
  defenseRating: number; // 1-5
  driverSkill: number;   // 1-5
  reliability: number;   // 1-5
  cooperation: number;   // 1-5
  notes: string;
  
  // Modular, game-specific custom fields data
  gameSpecificValues: Record<string, any>;
  autoPathPoints?: Array<{ x: number; y: number }>;
}

export interface TeamAggregatedStats {
  teamNumber: string;
  teamName: string;
  schoolName?: string;
  city?: string;
  state?: string;
  matchCount: number;
  
  // Generic Aggregates
  autoDriveRate: number; // % of matches they drove in auto
  avgAutoScored: number;
  avgTeleopScored: number;
  avgDefense: number;
  avgDriverSkill: number;
  avgReliability: number;
  avgCooperation: number;
  
  // Custom Game-Specific Aggregates
  customAverages: Record<string, any>; // fieldId -> dynamic calculated average
  
  // Qualitative data
  allNotes: string[];
  scoutNames: string[];
  lastScoutedAt: number;
}

// Game specific templates presets
export interface GamePreset {
  id: string;
  gameName: string;
  season: string;
  fields: ScoutingFieldConfig[];
}

export const GAME_PRESETS: GamePreset[] = [
  {
    id: "decode",
    gameName: "DECODE",
    season: "2025-2026",
    fields: [
      {
        id: "autoCloseAuto",
        label: "Has Close Auto?",
        type: "boolean",
        section: "auto",
        defaultValue: false,
      },
      {
        id: "autoFarAuto",
        label: "Has Far Auto?",
        type: "boolean",
        section: "auto",
        defaultValue: false,
      },
      {
        id: "autoCloseScored",
        label: "Close Auto Items Scored",
        type: "number",
        section: "auto",
        defaultValue: 0,
      },
      {
        id: "autoFarScored",
        label: "Far Auto Items Scored",
        type: "number",
        section: "auto",
        defaultValue: 0,
      },
      {
        id: "autoLeavePoints",
        label: "Auto Leave starting tile?",
        type: "boolean",
        section: "auto",
        defaultValue: false,
      },
      {
        id: "teleopCanSort",
        label: "Can Sort Game Elements?",
        type: "boolean",
        section: "teleop",
        defaultValue: false,
      },
      {
        id: "teleopCloseZoneScore",
        label: "Teleop Close Zone Score",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      {
        id: "teleopAutoScore",
        label: "Teleop Auto Score",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      {
        id: "endgameParkPoints",
        label: "Endgame Park Points?",
        type: "boolean",
        section: "endgame",
        defaultValue: false,
      }
    ]
  },
  {
    id: "into-the-deep",
    gameName: "Into the Deep",
    season: "2024-2025",
    fields: [
      // Autonomous Fields
      {
        id: "autoBasketsHigh",
        label: "Auto Baskets (High)",
        type: "number",
        section: "auto",
        defaultValue: 0,
      },
      {
        id: "autoBasketsLow",
        label: "Auto Baskets (Low)",
        type: "number",
        section: "auto",
        defaultValue: 0,
      },
      {
        id: "autoSpecimensHigh",
        label: "Auto Specimens High Chamber",
        type: "number",
        section: "auto",
        defaultValue: 0,
      },
      // Teleop Fields
      {
        id: "teleopBasketsHigh",
        label: "Teleop Baskets (High)",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      {
        id: "teleopSpecimensHigh",
        label: "Teleop Specimens High Chamber",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      // Endgame Fields
      {
        id: "endgameAscentLevel",
        label: "Ascent Level Reached",
        type: "select",
        section: "endgame",
        options: ["None", "Level 1", "Level 2", "Level 3"],
        defaultValue: "None",
      },
      {
        id: "endgameParked",
        label: "Parked in Submersible?",
        type: "boolean",
        section: "endgame",
        defaultValue: false,
      }
    ]
  },
  {
    id: "centerstage",
    gameName: "Centerstage",
    season: "2023-2024",
    fields: [
      {
        id: "autoYellowPixelPlaced",
        label: "Auto Yellow Pixel Placed",
        type: "boolean",
        section: "auto",
        defaultValue: false,
      },
      {
        id: "teleopPixelsOnBackdrop",
        label: "Teleop Pixels on Backdrop",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      {
        id: "teleopMosaicsCompleted",
        label: "Mosaics Completed",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      {
        id: "endgameDroneZone",
        label: "Drone Landing Zone",
        type: "select",
        section: "endgame",
        options: ["None/Missed", "Zone 1", "Zone 2", "Zone 3"],
        defaultValue: "None/Missed",
      },
      {
        id: "endgameSuspended",
        label: "Suspended on Rigging",
        type: "boolean",
        section: "endgame",
        defaultValue: false,
      }
    ]
  },
  {
    id: "generic-game",
    gameName: "Standard Game (General)",
    season: "All seasons",
    fields: [
      {
        id: "autoScoredExtra",
        label: "Autonomous Extra Scoring items",
        type: "number",
        section: "auto",
        defaultValue: 0,
      },
      {
        id: "teleopScoredHigh",
        label: "Teleop High Zone Items",
        type: "number",
        section: "teleop",
        defaultValue: 0,
      },
      {
        id: "endgameHeavyAction",
        label: "Completed Major Endgame Task",
        type: "boolean",
        section: "endgame",
        defaultValue: false,
      }
    ]
  }
];

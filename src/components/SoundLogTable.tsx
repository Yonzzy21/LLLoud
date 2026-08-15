import React, { useState } from 'react';
import { 
  Trash2, 
  Download, 
  Copy, 
  Check, 
  Clock, 
  RotateCcw, 
  FileSpreadsheet, 
  Filter,
  Play,
  Pause
} from 'lucide-react';
import { SoundLogEntry } from '../types';
import { getCategoryColor } from '../utils/audioEngine';

interface SoundLogTableProps {
  logs: SoundLogEntry[];
  isAutoLogging: boolean;
  logIntervalSec: number;
  onToggleAutoLog: () => void;
  onIntervalChange: (sec: number) => void;
  onClearLogs: () => void;
  onDeleteEntry: (id: string) => void;
  onCenterMapOnLog?: (lat: number, lon: number) => void;
}

export const SoundLogTable: React.FC<SoundLogTableProps> = ({
  logs,
  isAutoLogging,
  logIntervalSec,
  onToggleAutoLog,
  onIntervalChange,
  onClearLogs,
  onDeleteEntry,
  onCenterMapOnLog,
}) => {
  const [copied, setCopied] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesCategory = filterCategory === 'all' || log.category === filterCategory;
    const matchesSearch = 
      searchQuery === '' ||
      (log.neighborhood && log.neighborhood.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.timeFormatted.includes(searchQuery) ||
      log.decibels.toString().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  // Export to CSV
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Timestamp', 'Time', 'Latitude', 'Longitude', 'Decibels_dB', 'Category', 'Neighborhood'];
    const rows = logs.map((l) => [
      l.timestamp,
      `"${l.timeFormatted}"`,
      l.latitude.toFixed(6),
      l.longitude.toFixed(6),
      l.decibels.toFixed(1),
      `"${l.category}"`,
      `"${l.neighborhood || 'N/A'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `loud_nyc_sound_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON
  const handleExportJSON = () => {
    if (logs.length === 0) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(logs, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `loud_nyc_sound_data_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Copy to Clipboard
  const handleCopy = () => {
    if (logs.length === 0) return;
    const text = logs
      .map((l) => `${l.timeFormatted} | ${l.decibels.toFixed(1)} dB | ${l.category} | ${l.neighborhood || 'NYC'} (${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)})`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Calculate quick metrics
  const avgDb = logs.length > 0 ? logs.reduce((acc, curr) => acc + curr.decibels, 0) / logs.length : 0;
  const maxEntry = logs.length > 0 ? logs.reduce((prev, current) => (prev.decibels > current.decibels ? prev : current), logs[0]) : null;

  return (
    <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
      {/* Header with Title & Auto-Log Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wider text-stone-300 uppercase">Location & Noise Log</h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-stone-800 text-amber-400 border border-stone-700">
                {logs.length} entries
              </span>
            </div>
            <p className="text-xs text-stone-500">Live timestamped GPS decibel tracking</p>
          </div>
        </div>

        {/* Auto Logging Interval & Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-stone-950/80 border border-stone-800 rounded-xl px-2.5 py-1 text-xs text-stone-300 gap-2">
            <Clock className="w-3.5 h-3.5 text-stone-500" />
            <span className="text-stone-400 text-[11px]">Every:</span>
            <select
              id="log-interval-select"
              value={logIntervalSec}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="bg-transparent text-amber-400 font-semibold focus:outline-none cursor-pointer"
            >
              <option value={2} className="bg-stone-900 text-stone-200">2s</option>
              <option value={3} className="bg-stone-900 text-stone-200">3s</option>
              <option value={5} className="bg-stone-900 text-stone-200">5s</option>
              <option value={10} className="bg-stone-900 text-stone-200">10s</option>
            </select>
          </div>

          <button
            id="toggle-autolog-btn"
            onClick={onToggleAutoLog}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              isAutoLogging
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 shadow-sm shadow-emerald-900/20'
                : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200'
            }`}
          >
            {isAutoLogging ? (
              <>
                <Pause className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Auto-Logging Active</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Enable Auto-Log</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Summary Highlights */}
      {logs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4 text-xs">
          <div className="p-2.5 bg-stone-950/70 border border-stone-800 rounded-xl">
            <span className="text-[10px] text-stone-500 uppercase font-medium">Logged Average</span>
            <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
              {avgDb.toFixed(1)} <span className="text-xs font-normal text-stone-400">dB</span>
            </div>
          </div>
          <div className="p-2.5 bg-stone-950/70 border border-stone-800 rounded-xl">
            <span className="text-[10px] text-stone-500 uppercase font-medium">Loudest Peak</span>
            <div className="text-base font-mono font-bold text-rose-400 mt-0.5 truncate">
              {maxEntry ? `${maxEntry.decibels.toFixed(1)} dB` : '--'}
              {maxEntry?.neighborhood && (
                <span className="text-[10px] text-stone-400 ml-1.5 font-normal">
                  ({maxEntry.neighborhood})
                </span>
              )}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 p-2.5 bg-stone-950/70 border border-stone-800 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-stone-500 uppercase font-medium">Actions</span>
              <div className="text-xs text-stone-400 mt-0.5">Export dataset</div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                id="export-csv-btn"
                onClick={handleExportCSV}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 hover:text-white transition-colors"
                title="Download CSV"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                id="copy-logs-btn"
                onClick={handleCopy}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 hover:text-white transition-colors"
                title="Copy to Clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Reset Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <input
            id="search-logs-input"
            type="text"
            placeholder="Search by neighborhood, time, or dB..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-950/70 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center bg-stone-950/70 border border-stone-800 rounded-xl px-2.5 py-1 text-xs text-stone-400 gap-1.5">
            <Filter className="w-3.5 h-3.5 text-stone-500" />
            <select
              id="filter-category-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent text-stone-300 text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-stone-900">All Levels</option>
              <option value="Quiet / Whisper" className="bg-stone-900">Quiet (&lt;45 dB)</option>
              <option value="Moderate Ambient" className="bg-stone-900">Moderate (45-65 dB)</option>
              <option value="Busy City / Traffic" className="bg-stone-900">City (65-78 dB)</option>
              <option value="Heavy Transit" className="bg-stone-900">Heavy Transit (78-88 dB)</option>
              <option value="Extreme / Sirens" className="bg-stone-900">Extreme (&gt;88 dB)</option>
            </select>
          </div>

          {/* Reset Button */}
          <button
            id="reset-logs-btn"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              logs.length === 0
                ? 'bg-stone-900 text-stone-600 border-stone-800 cursor-not-allowed'
                : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/50 hover:border-rose-700'
            }`}
            title="Clear all recorded sound entries"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Log</span>
          </button>
        </div>
      </div>

      {/* Table Display */}
      <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-950/70">
        <div className="overflow-x-auto max-h-72 sm:max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-stone-900/90 text-stone-400 sticky top-0 z-10 border-b border-stone-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Time</th>
                <th className="py-2.5 px-3 font-semibold">Sound Level</th>
                <th className="py-2.5 px-3 font-semibold">Classification</th>
                <th className="py-2.5 px-3 font-semibold">NYC Location</th>
                <th className="py-2.5 px-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500 font-sans text-xs">
                    {logs.length === 0
                      ? 'No sound points logged yet. Start the meter above to automatically log noise readings with your GPS coordinates.'
                      : 'No log entries match your current search/filter.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const style = getCategoryColor(log.category);
                  return (
                    <tr key={log.id} className="hover:bg-stone-900/60 transition-colors">
                      {/* Time */}
                      <td className="py-2 px-3 text-stone-300 whitespace-nowrap">
                        {log.timeFormatted}
                      </td>

                      {/* Decibels */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className="font-bold text-sm"
                          style={{ color: style.hex }}
                        >
                          {log.decibels.toFixed(1)} dB
                        </span>
                      </td>

                      {/* Classification Badge */}
                      <td className="py-2 px-3 whitespace-nowrap font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.badge}`}
                        >
                          {log.category}
                        </span>
                      </td>

                      {/* Location & Neighborhood */}
                      <td className="py-2 px-3 text-stone-300 font-sans whitespace-nowrap">
                        <div className="font-medium text-stone-200">
                          {log.neighborhood || 'NYC Coordinates'}
                        </div>
                        <div className="text-[10px] font-mono text-stone-500">
                          {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                        </div>
                      </td>

                      {/* Action (Delete / Map) */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {onCenterMapOnLog && (
                            <button
                              onClick={() => onCenterMapOnLog(log.latitude, log.longitude)}
                              className="px-2 py-1 text-[10px] rounded bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 hover:text-amber-400 transition-colors"
                              title="Show on map"
                            >
                              Map
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteEntry(log.id)}
                            className="p-1 rounded text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

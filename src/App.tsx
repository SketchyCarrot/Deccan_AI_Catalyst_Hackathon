import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Bolt, 
  Send, 
  Mic, 
  Paperclip, 
  Target, 
  User, 
  Clock,
  Loader2,
  ArrowLeft,
  MessageSquare
} from "lucide-react";
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Candidate {
  id: string;
  name: string;
  title: string;
  experience: number;
  matchScore: number;
  interestScore: number | null;
  explainability: string;
  skill_radar: Record<string, number>;
  status?: string;
  insights?: {
    pros: string[];
    cons: string[];
    cultureFit: string;
  };
}

interface ChatMessage {
  role: "candidate" | "recruiter" | "system";
  content: string;
}

// --- Components ---

const RadarVisualization = ({ data }: { data: Record<string, number> }) => {
  const chartData = Object.entries(data).map(([subject, value]) => ({
    subject,
    value,
    fullMark: 100,
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b" }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Skills"
            dataKey="value"
            stroke="#2563eb"
            fill="#3b82f6"
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<"landing" | "dashboard">("landing");
  const [jd, setJd] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [scoutData, setScoutData] = useState<{ jd_tags: string[]; candidates: Candidate[] } | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [filterMode, setFilterMode] = useState<"score" | "interest" | "new">("score");
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isTyping]);

  const handleLaunch = async () => {
    if (!jd.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jd }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to analyze candidates");
      }

      const data = await res.json();
      setScoutData(data);
      setView("dashboard");
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectCandidate = (c: Candidate) => {
    setSelectedCandidate(c);
    setChatHistory([
      { role: "candidate", content: `Hi! I saw you reached out about the ${c.title} role. I've heard great things about the team. Is there a good time for us to chat?` }
    ]);
  };

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedFile) || !selectedCandidate) return;

    const recruiterMsg: ChatMessage = { 
      role: "recruiter", 
      content: selectedFile ? `[File: ${selectedFile.name}] ${inputValue}` : inputValue 
    };
    
    const newHistory = [...chatHistory, recruiterMsg];
    setChatHistory(newHistory);
    setInputValue("");
    setIsTyping(true);

    try {
      const formData = new FormData();
      formData.append("candidate_id", selectedCandidate.id);
      formData.append("history", JSON.stringify(newHistory));
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: "candidate", content: data.reply }]);
      
      // Update the interest score for the selected candidate in the list
      if (scoutData) {
        setScoutData({
          ...scoutData,
          candidates: scoutData.candidates.map(candidate => 
            candidate.id === selectedCandidate.id ? { ...candidate, interestScore: data.interestScore } : candidate
          )
        });
      }
      setSelectedCandidate(prev => prev ? { ...prev, interestScore: data.interestScore } : null);
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    const recognition = new SpeechRecognition();
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(prev => prev + " " + transcript);
    };
    recognition.start();
  };

  const handleDraftOutreach = async () => {
    if (!selectedCandidate) return;
    setIsDrafting(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: selectedCandidate, jd_text: jd }),
      });
      const data = await res.json();
      setInputValue(data.draft);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDrafting(false);
    }
  };

  const updateStatus = (id: string, status: string) => {
    if (scoutData) {
      setScoutData({
        ...scoutData,
        candidates: scoutData.candidates.map(c => c.id === id ? { ...c, status } : c)
      });
      if (selectedCandidate?.id === id) {
        setSelectedCandidate({ ...selectedCandidate, status });
      }
    }
  };

  const filteredCandidates = scoutData?.candidates
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (filterMode === "score") return b.matchScore - a.matchScore;
      if (filterMode === "interest") return (b.interestScore || 0) - (a.interestScore || 0);
      return 0;
    });

  if (view === "landing") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8 md:p-12 border border-slate-100"
        >
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-200">
              <Bot size={40} />
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-3">ScoutAI Talent Agent</h1>
            <p className="text-slate-500 max-w-sm">
              Deploy an autonomous recruiter to parse JDs, rank candidates, and automate reach-out.
            </p>
          </div>

          <div className="space-y-6">
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm font-medium"
              >
                {errorMsg}
              </motion.div>
            )}
            <div className="relative">
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                className="w-full h-48 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none shadow-inner"
                placeholder="Paste the Job Description here..."
              />
              <div className="absolute top-3 right-3 text-slate-300">
                <Target size={20} />
              </div>
            </div>

            <button
              id="deploy-agent-btn"
              onClick={handleLaunch}
              disabled={isLoading || !jd.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <Bolt size={20} className="group-hover:scale-110 transition-transform" />
                  Deploy Scouting Agent
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-100 flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar - Candidate List */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-slate-200 flex flex-col h-1/2 md:h-full">
        <div className="p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
             <button onClick={() => setView('landing')} className="text-slate-400 hover:text-blue-600 transition-colors">
              <ArrowLeft size={18} />
             </button>
             <h2 className="font-bold text-slate-800 flex items-center gap-2">
               <User size={18} /> Candidates
             </h2>
             <span className="bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full font-semibold">
               {scoutData?.candidates.length || 0} Found
             </span>
          </div>
          <div className="space-y-3">
            <input 
              type="text" 
              placeholder="Search talent..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setFilterMode("score")}
                className={cn("text-[10px] uppercase font-bold py-1 px-2 rounded", filterMode === 'score' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400")}
              >Score</button>
              <button 
                onClick={() => setFilterMode("interest")}
                className={cn("text-[10px] uppercase font-bold py-1 px-2 rounded", filterMode === 'interest' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400")}
              >Interest</button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {filteredCandidates?.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCandidate(c)}
              className={cn(
                "w-full text-left p-4 rounded-2xl border transition-all duration-200 group relative overflow-hidden",
                selectedCandidate?.id === c.id 
                  ? "bg-blue-600 border-blue-600 text-white shadow-lg" 
                  : "bg-white border-slate-100 hover:border-blue-300 text-slate-800"
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold truncate max-w-[70%]">{c.name}</span>
                <span className={cn(
                  "text-xs font-bold", 
                  selectedCandidate?.id === c.id ? "text-blue-100" : "text-blue-600"
                )}>
                  {c.matchScore}% Match
                </span>
              </div>
              <div className={cn(
                "text-xs mb-3",
                selectedCandidate?.id === c.id ? "text-blue-100" : "text-slate-400"
              )}>
                {c.title}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all duration-500", selectedCandidate?.id === c.id ? "bg-white/50" : "bg-blue-400")} 
                    style={{ width: `${c.interestScore || 0}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold uppercase shrink-0">
                  {c.interestScore === null ? 'Reach out' : `Interest: ${c.interestScore}%`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative h-full">
        <AnimatePresence mode="wait">
          {!selectedCandidate ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mb-6">
                <MessageSquare size={48} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Select a candidate to start outreach</h3>
              <p className="text-slate-400 max-w-xs text-sm">Review their match analysis and engage them with ScoutAI to assess interest.</p>
            </motion.div>
          ) : (
            <motion.div 
              key="details"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col md:flex-row overflow-hidden h-full"
            >
              {/* Analysis Panel */}
              <div className="w-full md:w-1/2 p-6 overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 space-y-8 bg-white no-scrollbar">
                <div>
                  <h2 className="text-3xl font-extrabold text-slate-900 mb-1">{selectedCandidate.name}</h2>
                  <div className="flex items-center gap-3 mb-6">
                    <p className="text-slate-500 flex items-center gap-2 text-sm">
                      <User size={16} /> {selectedCandidate.title} • {selectedCandidate.experience}y Exp
                    </p>
                    <select 
                      value={selectedCandidate.status || "Lead"}
                      onChange={(e) => updateStatus(selectedCandidate.id, e.target.value)}
                      className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded-lg border-none focus:ring-0 cursor-pointer"
                    >
                      <option value="Lead">Lead</option>
                      <option value="Sourced">Sourced</option>
                      <option value="Interview">Interview</option>
                      <option value="Offer">Offer</option>
                      <option value="Hired">Hired</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <h5 className="text-[10px] uppercase font-bold text-emerald-600 mb-2">Key Advantages</h5>
                      <ul className="text-xs text-emerald-800 space-y-1">
                        {(selectedCandidate.insights?.pros || ["Expert tech stack alignment", "Great pedigree"]).map((p, i) => (
                          <li key={i} className="flex gap-2"><span>•</span> {p}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl">
                      <h5 className="text-[10px] uppercase font-bold text-orange-600 mb-2">Potential Risks</h5>
                      <ul className="text-xs text-orange-800 space-y-1">
                        {(selectedCandidate.insights?.cons || ["Relocation required", "Notice period unknown"]).map((c, i) => (
                          <li key={i} className="flex gap-2"><span>•</span> {c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-blue-900 text-sm leading-relaxed mb-6">
                    <h4 className="font-bold flex items-center gap-2 mb-2 text-blue-700">
                      <Bolt size={14} /> AI Analysis Summary
                    </h4>
                    <div className="prose prose-sm prose-blue max-w-none">
                      <ReactMarkdown>
                        {selectedCandidate.explainability}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Target size={16} className="text-blue-600" /> Skill Proficiency Radar
                  </h4>
                  <RadarVisualization data={selectedCandidate.skill_radar} />
                </div>
              </div>

              {/* Chat Panel */}
              <div className="w-full md:w-1/2 flex flex-col min-h-0 bg-slate-50 h-full">
                <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                      <User size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{selectedCandidate.name}</div>
                      <div className="text-[10px] text-green-500 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Simulated Candidate
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                    Interest Score: {selectedCandidate.interestScore || 0}%
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                  {chatHistory.map((msg, i) => (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={i}
                      className={cn(
                        "flex flex-col group",
                        msg.role === 'recruiter' ? "items-end" : "items-start"
                      )}
                    >
                      <div className={cn(
                        "max-w-[85%] px-4 py-3 text-sm shadow-sm",
                        msg.role === 'recruiter' 
                          ? "bg-blue-600 text-white rounded-t-2xl rounded-bl-2xl" 
                          : "bg-slate-200 text-slate-800 rounded-t-2xl rounded-br-2xl font-medium"
                      )}>
                        {msg.content}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Clock size={10} /> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <div className="flex items-start gap-2">
                      <div className="bg-slate-200 px-4 py-3 rounded-2xl flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                  {selectedFile && (
                    <div className="mb-2 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between text-xs text-blue-700">
                      <div className="flex items-center gap-2">
                        <Paperclip size={14} />
                        <span className="font-medium truncate max-w-[200px]">{selectedFile.name}</span>
                      </div>
                      <button onClick={() => setSelectedFile(null)} className="hover:text-blue-900 font-bold px-1">✕</button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="application/pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className={cn("p-2 transition-colors", selectedFile ? "text-blue-600" : "text-slate-400 hover:text-blue-600")}
                    >
                      <Paperclip size={20} />
                    </button>
                    <input 
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder={`Message ${selectedCandidate.name.split(' ')[0]}...`}
                      className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder:text-slate-400 p-1"
                    />
                    <button 
                      onClick={handleVoiceInput}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Mic size={20} />
                    </button>
                    <button 
                      onClick={handleDraftOutreach}
                      disabled={isDrafting}
                      className="p-2 text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 text-xs font-bold"
                    >
                      {isDrafting ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
                      <span>Draft</span>
                    </button>
                    <button 
                      onClick={handleSendMessage}
                      disabled={(!inputValue.trim() && !selectedFile) || isTyping}
                      className="bg-blue-600 hover:bg-blue-700 p-2 rounded-xl text-white transition-all shadow-md active:scale-95 disabled:bg-slate-300"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

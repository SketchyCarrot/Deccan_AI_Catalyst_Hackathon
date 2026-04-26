import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, Bolt, Send, Mic, Paperclip, Target, User, 
  Loader2, ArrowLeft, MessageSquare, ChevronDown, 
  Lock, CheckCircle2, FileText 
} from "lucide-react";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer 
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface Candidate {
  id: string; name: string; title: string; experience: number; matchScore?: number;
  interestScore?: number | null; explainability?: string; skill_radar?: Record<string, number>;
  status?: string; location?: string; noticePeriod?: string; education?: string; resumeText?: string;
}

const RadarVisualization = ({ data }: { data?: Record<string, number> }) => {
  if (!data || Object.keys(data).length === 0) return null;
  const chartData = Object.entries(data).map(([subject, value]) => ({ subject, value, fullMark: 100 }));

  return (
    <div className="w-full flex flex-col h-full min-h-[200px]">
      <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-2 text-sm shrink-0">
        <Target size={16} className="text-blue-600" /> Skill Proficiency Radar
      </h4>
      <div className="relative flex-1 w-full min-h-[180px]">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Skills" dataKey="value" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [auth, setAuth] = useState<{ role: 'admin' | 'candidate' | null, candidateId?: string }>({ role: null });
  const [view, setView] = useState<"login" | "admin_landing" | "admin_dashboard" | "candidate_dashboard" | "apply">("login");
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const [jd, setJd] = useState("");
  const [priority, setPriority] = useState("Balanced");
  const [scoutData, setScoutData] = useState<{ jd_tags: string[]; candidates: Candidate[] } | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  
  const [myProfile, setMyProfile] = useState<Candidate | null>(null);
  const [applyForm, setApplyForm] = useState({ name: "", title: "", experience: 0, education: "", location: "", noticePeriod: "", skills: "", resumeText: "" });
  
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setErrorMsg(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        setAuth({ role: data.role, candidateId: data.candidateId });
        if (data.role === 'admin') setView("admin_landing");
        else {
          await fetchCandidateProfile(data.candidateId);
          setView("candidate_dashboard");
        }
      } else setErrorMsg(data.error);
    } catch (err) { setErrorMsg("Login failed"); }
    finally { setIsLoading(false); }
  };

  const fetchCandidateProfile = async (id: string) => {
    const res = await fetch(`/api/candidate/${id}`);
    const data = await res.json();
    setMyProfile(data);
    setChatHistory([{ role: "recruiter", content: `Hi ${data.name.split(' ')[0]}! I'm the ScoutAI assistant. How can I help you regarding your application today?` }]);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applyForm)
      });
      const data = await res.json();
      alert(`Applied! Login with Username: ${data.username} | Password: ${data.password}`);
      setView("login");
    } catch (err) { setErrorMsg("Application failed"); }
    finally { setIsLoading(false); }
  };

  const handleAdminLaunch = async () => {
    if (!jd.trim()) return;
    setIsLoading(true); setErrorMsg(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jd, priority }),
      });
      const data = await res.json();
      setScoutData(data);
      setView("admin_dashboard");
    } catch (error: any) { setErrorMsg(error.message); } 
    finally { setIsLoading(false); }
  };

  const handleManualRate = async (score: number) => {
    if (!selectedCandidate) return;
    try {
      const res = await fetch("/api/candidate/rate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: selectedCandidate.id, score })
      });
      if (res.ok) {
        setSelectedCandidate({...selectedCandidate, interestScore: score});
        if (scoutData) {
          setScoutData({...scoutData, candidates: scoutData.candidates.map(c => 
            c.id === selectedCandidate.id ? { ...c, interestScore: score } : c
          )});
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedFile)) return;
    
    const senderRole = auth.role === 'admin' ? "recruiter" : "candidate";
    const targetId = auth.role === 'admin' ? selectedCandidate?.id : myProfile?.id;
    
    if (!targetId) return;

    const displayMsg = selectedFile ? `[File: ${selectedFile.name}] ${inputValue}` : inputValue;
    const newHistory = [...chatHistory, { role: senderRole, content: displayMsg }];
    
    setChatHistory(newHistory);
    setInputValue("");
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("candidate_id", targetId);
      formData.append("history", JSON.stringify(newHistory));
      formData.append("isCandidateRole", String(auth.role === 'candidate'));
      
      if (selectedFile) formData.append("file", selectedFile);

      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const responderRole = auth.role === 'admin' ? "candidate" : "recruiter";
      
      setChatHistory(prev => [...prev, { role: responderRole, content: data.reply }]);
      setSelectedFile(null);
      
      if (auth.role === 'admin' && scoutData && selectedCandidate && data.interestScore) {
        setScoutData({...scoutData, candidates: scoutData.candidates.map(c => 
          c.id === selectedCandidate.id ? { ...c, interestScore: data.interestScore } : c
        )});
        setSelectedCandidate(prev => prev ? {...prev, interestScore: data.interestScore} : null);
      }
    } catch (error) { console.error(error); } 
    finally { setIsLoading(false); }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    const recognition = new SpeechRecognition();
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.start();
  };

  const getStarterMessages = (name: string, title: string) => [
    `Hi ${name.split(' ')[0]}, your profile looks like a great fit! Are you open to new roles?`,
    `Hello! I'm recruiting for a ${title} position and your experience stood out.`,
    `Hi there! Would you have 10 minutes this week for a quick introductory call?`
  ];

  // --- Renderers ---
  if (view === "login") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-4"><Lock size={30} /></div>
            <h1 className="text-2xl font-extrabold text-slate-900">ScoutAI Login</h1>
            <p className="text-slate-500 text-sm mt-2 text-center">Login as Admin (recruiter) or Candidate.<br/>Admin: admin / admin123<br/>Candidate: jdoe / password</p>
          </div>
          {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4">{errorMsg}</div>}
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" required />
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : "Sign In"}
            </button>
          </form>
          <div className="mt-6 text-center border-t border-slate-100 pt-6">
            <p className="text-sm text-slate-500 mb-3">Looking for a job?</p>
            <button onClick={() => setView('apply')} className="text-blue-600 font-bold hover:underline text-sm">Submit an Application</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "apply") {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <button onClick={() => setView('login')} className="text-slate-400 hover:text-blue-600 mb-6 flex items-center gap-2"><ArrowLeft size={16}/> Back to Login</button>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-6">Candidate Application</h1>
          <form onSubmit={handleApply} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-bold text-slate-500 uppercase">Full Name</label><input required type="text" className="w-full border rounded-lg p-2 mt-1" value={applyForm.name} onChange={e=>setApplyForm({...applyForm, name: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Desired Title</label><input required type="text" className="w-full border rounded-lg p-2 mt-1" value={applyForm.title} onChange={e=>setApplyForm({...applyForm, title: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Years Experience</label><input required type="number" className="w-full border rounded-lg p-2 mt-1" value={applyForm.experience} onChange={e=>setApplyForm({...applyForm, experience: parseInt(e.target.value)})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Location</label><input required type="text" className="w-full border rounded-lg p-2 mt-1" value={applyForm.location} onChange={e=>setApplyForm({...applyForm, location: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Education</label><input required type="text" className="w-full border rounded-lg p-2 mt-1" value={applyForm.education} onChange={e=>setApplyForm({...applyForm, education: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Notice Period</label><input required type="text" className="w-full border rounded-lg p-2 mt-1" value={applyForm.noticePeriod} onChange={e=>setApplyForm({...applyForm, noticePeriod: e.target.value})} /></div>
            </div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Core Skills (Comma separated)</label><input required type="text" className="w-full border rounded-lg p-2 mt-1" value={applyForm.skills} onChange={e=>setApplyForm({...applyForm, skills: e.target.value})} /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileText size={14}/> Paste Resume Text</label><textarea required className="w-full border rounded-lg p-2 mt-1 h-32" value={applyForm.resumeText} onChange={e=>setApplyForm({...applyForm, resumeText: e.target.value})} /></div>
            
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl mt-4">
               {isLoading ? <Loader2 className="animate-spin mx-auto" /> : "Submit Application"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "candidate_dashboard" && myProfile) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex justify-center">
        <div className="max-w-4xl w-full flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 h-fit">
             <div className="flex justify-between items-center mb-6">
               <h2 className="font-extrabold text-xl">My Profile</h2>
               <button onClick={() => { setAuth({role: null}); setView('login'); }} className="text-sm text-red-500 font-bold">Logout</button>
             </div>
             <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold mb-4">{myProfile.name.charAt(0)}</div>
             <h3 className="text-lg font-bold">{myProfile.name}</h3>
             <p className="text-slate-500 text-sm mb-6">{myProfile.title}</p>
             
             <div className="bg-slate-50 rounded-xl p-4 mb-6">
               <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Application Status</span>
               <div className="flex items-center gap-2 text-green-600 font-bold">
                 <CheckCircle2 size={18} /> {myProfile.status}
               </div>
             </div>

             <div className="space-y-3 text-sm">
               <div className="flex justify-between border-b pb-2"><span className="text-slate-500">Experience</span><span className="font-bold">{myProfile.experience} years</span></div>
               <div className="flex justify-between border-b pb-2"><span className="text-slate-500">Notice</span><span className="font-bold">{myProfile.noticePeriod}</span></div>
               <div className="flex justify-between border-b pb-2"><span className="text-slate-500">Location</span><span className="font-bold">{myProfile.location}</span></div>
             </div>
          </div>
          
          <div className="w-full md:w-2/3 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white"><Bot size={20} /></div>
              <div><h3 className="font-bold">ScoutAI Recruiter</h3><p className="text-xs text-green-500">Online</p></div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.map((msg, i) => (
                <div key={i} className={cn("flex flex-col", msg.role === 'candidate' ? "items-end" : "items-start")}>
                  <div className={cn("max-w-[80%] px-4 py-3 text-sm shadow-sm", msg.role === 'candidate' ? "bg-blue-600 text-white rounded-t-2xl rounded-bl-2xl" : "bg-slate-100 text-slate-800 rounded-t-2xl rounded-br-2xl")}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && <Loader2 className="animate-spin text-slate-400 m-2" size={16} />}
              <div ref={chatEndRef} />
            </div>

            <div className="bg-white border-t rounded-b-3xl">
              {selectedFile && (
                <div className="m-3 mb-0 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between text-xs text-blue-700">
                  <div className="flex items-center gap-2"><Paperclip size={14} /><span className="font-medium truncate">{selectedFile.name}</span></div>
                  <button onClick={() => setSelectedFile(null)} className="hover:text-blue-900 font-bold px-1">✕</button>
                </div>
              )}
              <div className="p-3 flex gap-2 items-center">
                <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                <button onClick={() => fileInputRef.current?.click()} className={cn("p-2 transition-colors", selectedFile ? "text-blue-600" : "text-slate-400 hover:text-blue-600")}>
                  <Paperclip size={20} />
                </button>
                <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 border rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500" placeholder="Message recruiter..." />
                <button onClick={handleVoiceInput} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Mic size={20} /></button>
                <button onClick={handleSendMessage} disabled={(!inputValue.trim() && !selectedFile) || isLoading} className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "admin_landing") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <button onClick={() => { setAuth({role: null}); setView('login'); }} className="absolute top-8 right-8 text-sm text-red-500 font-bold">Logout Admin</button>
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-4"><Bot size={32} /></div>
            <h1 className="text-3xl font-extrabold text-slate-900">Admin Deployment</h1>
          </div>
          {errorMsg && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm mb-4">{errorMsg}</div>}
          <div className="space-y-4">
            <textarea value={jd} onChange={(e) => setJd(e.target.value)} className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Paste Job Description..." />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 outline-none focus:ring-2">
              <option value="Balanced">Balanced</option>
              <option value="Technical Skills">Technical Focus</option>
              <option value="Experience">Experience Focus</option>
            </select>
            <button onClick={handleAdminLaunch} disabled={isLoading || !jd.trim()} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="animate-spin" /> : <><Bolt size={20} /> Scan Database</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "admin_dashboard") {
    return (
      <div className="h-screen bg-slate-100 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-1/3 bg-white border-r border-slate-200 flex flex-col h-full min-h-0">
          <div className="p-6 border-b"><button onClick={() => setView('admin_landing')} className="text-slate-400 hover:text-blue-600 mb-2"><ArrowLeft size={18} /></button><h2 className="font-bold">Candidates Found: {scoutData?.candidates.length}</h2></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {scoutData?.candidates.map((c) => (
              <button key={c.id} onClick={() => { setSelectedCandidate(c); setChatHistory([]); }} className={cn("w-full text-left p-4 rounded-xl border transition-colors flex flex-col gap-1", selectedCandidate?.id === c.id ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-800 hover:border-blue-300")}>
                <div className="flex justify-between items-start w-full gap-2">
                  <span className="font-bold truncate">{c.name}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", selectedCandidate?.id === c.id ? "bg-black/20" : "bg-slate-100 text-slate-600")}>{c.matchScore}%</span>
                </div>
                <div className="text-xs opacity-90 truncate w-full">{c.title} • {c.experience}y exp</div>
              </button>
            ))}
          </div>
        </div>
        
        <main className="flex-1 flex flex-col bg-slate-50 min-w-0 min-h-0 h-full overflow-hidden">
          {!selectedCandidate ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Select a candidate to view details and chat</div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-6 bg-white border-b shrink-0 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[45vh] overflow-y-auto">
                <div className="flex flex-col h-full">
                  <h2 className="text-2xl font-bold">{selectedCandidate.name}</h2>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
                    <div className="text-xs font-bold text-blue-600 bg-blue-50 p-1.5 px-3 rounded-full flex items-center gap-1">
                      Interest: {selectedCandidate.interestScore || '?'}%
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                      <input 
                        type="number" 
                        id="manualScoreInput"
                        placeholder="Override %" 
                        min="0" max="100"
                        className="w-24 text-xs p-1 bg-white border border-slate-200 rounded outline-none" 
                        onKeyDown={(e) => {
                          if(e.key === 'Enter') handleManualRate(Number(e.currentTarget.value));
                        }}
                      />
                      <button 
                        onClick={() => {
                          const val = (document.getElementById('manualScoreInput') as HTMLInputElement).value;
                          if(val) handleManualRate(Number(val));
                        }}
                        className="text-xs bg-slate-300 text-slate-700 font-bold px-2 py-1 rounded hover:bg-slate-400 transition-colors"
                      >
                        Set
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">AI auto-updates <br/> during chat</span>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1">{selectedCandidate.explainability}</p>
                </div>
                <div className="hidden md:flex flex-col">
                  <RadarVisualization data={selectedCandidate.skill_radar} />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 min-h-0">
                {chatHistory.length === 0 && (
                  <div className="text-center text-sm text-slate-400 mt-10">Start the conversation below.</div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={cn("flex flex-col mb-4", msg.role === 'recruiter' ? "items-end" : "items-start")}>
                    <div className={cn("max-w-[80%] p-3 rounded-2xl text-sm shadow-sm border border-slate-100", msg.role === 'recruiter' ? "bg-blue-600 text-white rounded-br-sm" : "bg-white text-slate-800 rounded-bl-sm")}>{msg.content}</div>
                  </div>
                ))}
                {isLoading && <Loader2 className="animate-spin text-slate-400" />}
                <div ref={chatEndRef} />
              </div>

              <div className="bg-white border-t shrink-0">
                {selectedFile && (
                  <div className="m-4 mb-0 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between text-xs text-blue-700">
                    <div className="flex items-center gap-2"><Paperclip size={14} /><span className="font-medium truncate">{selectedFile.name}</span></div>
                    <button onClick={() => setSelectedFile(null)} className="hover:text-blue-900 font-bold px-1">✕</button>
                  </div>
                )}
                
                <div className="p-4 pb-2">
                  {chatHistory.length === 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                      {getStarterMessages(selectedCandidate.name, selectedCandidate.title).map((msg, i) => (
                        <button 
                          key={i} 
                          onClick={() => setInputValue(msg)} 
                          className="whitespace-nowrap text-xs bg-slate-50 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                        >
                          {msg}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 items-center">
                    <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                    <button onClick={() => fileInputRef.current?.click()} className={cn("p-2 transition-colors", selectedFile ? "text-blue-600" : "text-slate-400 hover:text-blue-600")}>
                      <Paperclip size={20} />
                    </button>
                    <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 bg-slate-50" placeholder="Message candidate..." />
                    <button onClick={handleVoiceInput} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Mic size={20} /></button>
                    <button onClick={handleSendMessage} disabled={(!inputValue.trim() && !selectedFile) || isLoading} className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return null;
}
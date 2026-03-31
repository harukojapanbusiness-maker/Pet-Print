/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from './lib/firebase';
import { 
  Camera, 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Download, 
  History, 
  Settings, 
  ChevronDown, 
  ChevronUp, 
  Moon, 
  Sun, 
  LogOut, 
  User, 
  Trash2, 
  CheckCircle2, 
  Loader2,
  Maximize2,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Transformation {
  id: string;
  uid: string;
  originalImage: string;
  resultImage: string;
  style: string;
  options: any;
  createdAt: any;
}

interface StylePreset {
  id: string;
  name: string;
  icon: string;
  prompt: string;
}

const STYLE_PRESETS: StylePreset[] = [
  { id: 'pixar', name: 'Pixar 3D', icon: '🎬', prompt: 'Transform this pet photo into a Pixar-style 3D animated character. Large expressive eyes, smooth rounded features, soft volumetric lighting, subsurface skin scattering, richly saturated colors, and a warm cinematic feel.' },
  { id: 'watercolor', name: 'Watercolor', icon: '🖼', prompt: 'Transform this image into a delicate watercolor painting. Wet-on-wet bleeding edges, visible paper texture, transparent layered washes, and soft desaturated tones.' },
  { id: 'neon', name: 'Sci-Fi Neon', icon: '🌌', prompt: 'Transform this image into a futuristic sci-fi neon artwork. Dark background, glowing cyan and magenta outlines, holographic sheen, and atmospheric light fog.' },
  { id: 'oil', name: 'Oil Painting', icon: '🎨', prompt: 'Transform this image into a classical oil painting. Thick impasto brushstrokes, chiaroscuro lighting, rich earth tones, and museum-quality depth.' },
  { id: 'anime', name: 'Anime', icon: '📺', prompt: 'Transform this image into a high-quality anime illustration. Clean ink outlines, cel shading, expressive features, and vibrant flat colors.' },
  { id: 'renaissance', name: 'Renaissance', icon: '🏺', prompt: 'Transform this image in the style of Italian Renaissance portraiture. Sfumato technique, warm ochre palette, and dignified classical composition.' },
];

// --- Components ---

const ComparisonSlider = ({ before, after }: { before: string; after: string }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const pos = ((x - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-square rounded-xl overflow-hidden cursor-ew-resize select-none bg-gray-100 dark:bg-gray-800"
      onMouseMove={handleMove}
      onTouchMove={handleMove}
    >
      <img src={before} alt="Before" className="absolute inset-0 w-full h-full object-contain" />
      <div 
        className="absolute inset-0 w-full h-full overflow-hidden" 
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        <img src={after} alt="After" className="absolute inset-0 w-full h-full object-contain" />
      </div>
      <div 
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-10"
        style={{ left: `${sliderPos}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center text-gray-600">
          <Maximize2 className="w-4 h-4 rotate-45" />
        </div>
      </div>
      <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">BEFORE</div>
      <div className="absolute bottom-4 right-4 bg-blue-600/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">AFTER</div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState('pixar');
  const [intensity, setIntensity] = useState(7);
  const [detail, setDetail] = useState('Balanced');
  const [background, setBackground] = useState('Keep original');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<Transformation[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [qualityMode, setQualityMode] = useState<'Standard' | 'Studio'>('Standard');

  // --- Auth & Sync ---
  useEffect(() => {
    const checkKey = async () => {
      const aistudio = (window as any).aistudio;
      if (aistudio) {
        const hasKey = await aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Sync user profile
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          createdAt: serverTimestamp()
        }, { merge: true });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const q = query(
      collection(db, 'transformations'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transformation));
      setHistory(docs);
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    return unsubscribe;
  }, [user]);

  // --- Actions ---
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSelectKey = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio) {
      await aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert("File too large (max 20MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setOriginalImage(ev.target?.result as string);
      setResultImage(null);
    };
    reader.readAsDataURL(file);
  };

  const transformImage = async () => {
    if (!originalImage || isProcessing) return;
    if (!user) {
      handleLogin();
      return;
    }

    setIsProcessing(true);
    setProgress(10);

    try {
      // Use the environment key by default
      const apiKey = process.env.GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey });
      const stylePreset = STYLE_PRESETS.find(s => s.id === selectedStyle);
      
      setProgress(30);
      
      // Default to gemini-2.5-flash-image which doesn't require a paid key
      let modelName = 'gemini-2.5-flash-image';
      
      // Only use paid models if explicitly in Studio mode
      if (qualityMode === 'Studio') {
        modelName = 'gemini-3-pro-image-preview';
      }
      
      const base64Data = originalImage.split(',')[1];
      const mimeType = originalImage.split(';')[0].split(':')[1];

      const prompt = `
        ${stylePreset?.prompt}
        Intensity: ${intensity}/10.
        Detail level: ${detail}.
        Background: ${background}.
        ${customPrompt ? `Additional instructions: ${customPrompt}` : ''}
        Maintain the subject's unique identity.
      `;

      setProgress(50);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: prompt }
          ]
        },
        config: {
          imageConfig: modelName !== 'gemini-2.5-flash-image' ? {
            aspectRatio: aspectRatio as any,
            imageSize: qualityMode === 'Studio' ? imageSize : undefined
          } : {
            aspectRatio: aspectRatio as any
          }
        }
      });

      setProgress(80);

      let generatedImage = null;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (generatedImage) {
        setResultImage(generatedImage);
        // Save to Firestore
        await addDoc(collection(db, 'transformations'), {
          uid: user.uid,
          originalImage,
          resultImage: generatedImage,
          style: selectedStyle,
          options: { intensity, detail, background, customPrompt, aspectRatio, imageSize, qualityMode },
          createdAt: serverTimestamp()
        });
      } else {
        throw new Error("No image generated in response");
      }

      setProgress(100);
    } catch (error: any) {
      console.error("Transformation failed:", error);
      if (error.message?.includes("Requested entity was not found") || error.message?.includes("permission denied")) {
        setHasApiKey(false);
        alert("API Key permission denied. Please select a valid API key from a paid project.");
      } else {
        alert("Transformation failed. Please try again.");
      }
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
      }, 500);
    }
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `petpixar_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render ---
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex flex-col transition-colors duration-300", darkMode ? "dark bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-900")}>
      
      {/* Optional API Key Guard Overlay for Studio Mode */}
      {qualityMode === 'Studio' && !hasApiKey && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 text-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-6 border border-gray-100 dark:border-gray-800"
          >
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto text-blue-600">
              <Settings className="w-8 h-8 animate-spin-slow" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Studio Mode Requires Key</h2>
              <p className="text-gray-500 text-sm">
                Studio-quality 4K generation requires a Gemini API key from a paid Google Cloud project. Switch to "Standard" mode to use the free model.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleSelectKey}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95"
              >
                Select API Key
              </button>
              <button 
                onClick={() => setQualityMode('Standard')}
                className="w-full py-3 text-gray-500 font-medium hover:text-blue-600 transition-colors"
              >
                Switch to Free Standard Mode
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* --- Top Nav --- */}
      <nav className="fixed top-0 inset-x-0 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Sparkles className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">PetPixar <span className="text-blue-600">AI</span></span>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {user ? (
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-800">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <img src={user.photoURL} alt="Profile" className="w-9 h-9 rounded-full border-2 border-blue-500" />
              <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-500 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md active:scale-95"
            >
              <User className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </nav>

      {/* --- Main Layout --- */}
      <main className="flex-1 pt-20 pb-10 px-6 grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-6 max-w-[1600px] mx-auto w-full">
        
        {/* --- Left Panel: Controls --- */}
        <aside className="space-y-6">
          {/* Upload */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Image
            </h3>
            <label className="relative group cursor-pointer block">
              <div className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-all",
                originalImage ? "border-blue-500 bg-blue-50/30 dark:bg-blue-900/10" : "border-gray-200 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-600"
              )}>
                {originalImage ? (
                  <div className="relative aspect-square rounded-lg overflow-hidden shadow-inner">
                    <img src={originalImage} alt="Original" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white text-xs font-medium">Change Photo</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-4">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium">Drag & Drop</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 20MB</p>
                  </div>
                )}
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
          </div>

          {/* Styles */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Choose Style
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_PRESETS.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    "flex flex-col items-center p-3 rounded-xl border transition-all text-center gap-1",
                    selectedStyle === style.id 
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500" 
                      : "border-gray-100 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700"
                  )}
                >
                  <span className="text-2xl">{style.icon}</span>
                  <span className="text-xs font-medium">{style.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Advanced Controls
              </h3>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            <AnimatePresence>
              {showAdvanced && (
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-5 pt-0 space-y-5 border-t border-gray-50 dark:border-gray-800">
                    {/* Quality Mode */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase">Quality Mode</label>
                      <div className="flex gap-2">
                        {['Standard', 'Studio'].map((m) => (
                          <button
                            key={m}
                            onClick={() => setQualityMode(m as any)}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-medium border transition-all",
                              qualityMode === m ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-gray-800 hover:border-blue-400"
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aspect Ratio */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        Aspect Ratio
                      </label>
                      <select 
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
                      >
                        {['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    {/* Image Size (Studio only) */}
                    {qualityMode === 'Studio' && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-1">
                          <Maximize2 className="w-3 h-3" />
                          Resolution
                        </label>
                        <div className="flex gap-2">
                          {['1K', '2K', '4K'].map((s) => (
                            <button
                              key={s}
                              onClick={() => setImageSize(s as any)}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-xs font-medium border transition-all",
                                imageSize === s ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-gray-800"
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Intensity */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Intensity</label>
                        <span className="text-xs font-bold text-blue-500">{intensity}/10</span>
                      </div>
                      <input 
                        type="range" min="1" max="10" 
                        value={intensity} 
                        onChange={(e) => setIntensity(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>

                    {/* Detail */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase">Artistic Detail</label>
                      <select 
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
                        className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
                      >
                        {['Balanced', 'Hyper-detailed', 'Painterly', 'Minimalist'].map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* Background */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase">Background</label>
                      <select 
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
                      >
                        {['Keep original', 'Blur background', 'Studio white', 'Transparent'].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Prompt */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase">Custom Instructions</label>
                      <textarea 
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="e.g. 'Add sparkles', 'Make it smile'..."
                        className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm resize-none h-20"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Transform Button */}
          <button
            onClick={transformImage}
            disabled={!originalImage || isProcessing}
            className={cn(
              "w-full py-4 rounded-2xl text-lg font-bold text-white shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3",
              !originalImage || isProcessing 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-6 h-6" />
                <span>Transform Now</span>
              </>
            )}
          </button>
        </aside>

        {/* --- Center Panel: Canvas --- */}
        <section className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden">
            {isProcessing && (
              <div className="absolute inset-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-10 text-center">
                <div className="w-full max-w-md space-y-6">
                  <div className="relative h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="absolute inset-y-0 left-0 bg-blue-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Magical things happening...</h2>
                    <p className="text-gray-500">Gemini is reimagining your pet as a {selectedStyle} masterpiece.</p>
                  </div>
                  <div className="flex justify-center gap-8">
                    {[
                      { step: 1, label: 'Analyzing', active: progress >= 10 },
                      { step: 2, label: 'Dreaming', active: progress >= 40 },
                      { step: 3, label: 'Rendering', active: progress >= 70 },
                      { step: 4, label: 'Finalizing', active: progress >= 90 },
                    ].map((s) => (
                      <div key={s.step} className="flex flex-col items-center gap-2">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                          s.active ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800 text-gray-400"
                        )}>
                          {s.step}
                        </div>
                        <span className={cn("text-[10px] font-bold uppercase tracking-widest", s.active ? "text-blue-600" : "text-gray-400")}>
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {resultImage && originalImage ? (
              <div className="w-full max-w-2xl space-y-6">
                <ComparisonSlider before={originalImage} after={resultImage} />
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Style</span>
                      <span className="text-sm font-bold">{STYLE_PRESETS.find(s => s.id === selectedStyle)?.name}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quality</span>
                      <span className="text-sm font-bold">{qualityMode}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ratio</span>
                      <span className="text-sm font-bold">{aspectRatio}</span>
                    </div>
                  </div>
                  <button 
                    onClick={downloadResult}
                    className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-lg active:scale-95"
                  >
                    <Download className="w-5 h-5" />
                    <span className="font-bold">Download</span>
                  </button>
                </div>
              </div>
            ) : originalImage ? (
              <div className="w-full max-w-2xl">
                <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-gray-800">
                  <img src={originalImage} alt="Preview" className="w-full h-full object-contain bg-gray-50 dark:bg-gray-800" />
                  <div className="absolute top-4 left-4 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20">
                    Original Preview
                  </div>
                </div>
                <p className="text-center text-gray-500 mt-6 text-sm">Click "Transform Now" to apply the {selectedStyle} style.</p>
              </div>
            ) : (
              <div className="text-center space-y-6 max-w-sm">
                <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mx-auto text-gray-300 dark:text-gray-700">
                  <ImageIcon className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Ready to create?</h2>
                  <p className="text-gray-500">Upload a photo of your pet to start the transformation.</p>
                </div>
                <label className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl cursor-pointer font-bold">
                  <Upload className="w-5 h-5" />
                  <span>Select Photo</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
              </div>
            )}
          </div>
        </section>

        {/* --- Right Panel: History --- */}
        <aside className="space-y-6">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col h-full max-h-[800px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <History className="w-4 h-4" />
                Recent Creations
              </h3>
              <span className="text-[10px] font-bold bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-500">
                {history.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {history.length > 0 ? (
                history.map((item) => (
                  <div 
                    key={item.id}
                    className="group relative bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-transparent hover:border-blue-500/30 transition-all cursor-pointer"
                    onClick={() => {
                      setOriginalImage(item.originalImage);
                      setResultImage(item.resultImage);
                      setSelectedStyle(item.style);
                      if (item.options) {
                        setIntensity(item.options.intensity || 7);
                        setDetail(item.options.detail || 'Balanced');
                        setBackground(item.options.background || 'Keep original');
                        setAspectRatio(item.options.aspectRatio || '1:1');
                        setQualityMode(item.options.qualityMode || 'Standard');
                      }
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                        <img src={item.resultImage} alt="Result" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{STYLE_PRESETS.find(s => s.id === item.style)?.name}</p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {item.createdAt?.toDate().toLocaleDateString()}
                        </p>
                        <div className="flex gap-1 mt-2">
                          <span className="text-[8px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-1.5 py-0.5 rounded uppercase">{item.options?.qualityMode}</span>
                          <span className="text-[8px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-1.5 py-0.5 rounded uppercase">{item.options?.aspectRatio}</span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          // Delete logic
                        }}
                        className="p-1.5 bg-white dark:bg-gray-700 rounded-lg shadow-md hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
                  <History className="w-8 h-8 text-gray-200 dark:text-gray-800 mb-2" />
                  <p className="text-xs text-gray-400">No transformations yet. Start creating!</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Pro Tip</span>
                </div>
                <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
                  Use "Studio" mode with "4K" resolution for museum-quality prints of your pet's transformation.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* --- Footer / Status --- */}
      <footer className="h-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            System Ready
          </span>
          <span>Model: Gemini 2.0 Pro</span>
        </div>
        <div className="flex items-center gap-6">
          <span>© 2026 PetPixar AI</span>
          <a href="#" className="hover:text-blue-600 transition-colors">Privacy</a>
          <a href="#" className="hover:text-blue-600 transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
}

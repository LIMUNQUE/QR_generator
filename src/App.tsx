/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import QRCodeStyling, {
  Options,
  DrawType,
  TypeNumber,
  Mode,
  ErrorCorrectionLevel,
  DotType,
  CornerSquareType,
  CornerDotType
} from "qr-code-styling";
import { 
  Download, 
  Link as LinkIcon, 
  Palette, 
  Settings, 
  Upload, 
  RefreshCw, 
  Check, 
  Layout, 
  Image as ImageIcon,
  Type
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Custom types for our state
type Extension = "png" | "jpeg" | "webp" | "svg";

export default function App() {
  const [url, setUrl] = useState("https://google.com");
  const [dotsColor, setDotsColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [dotsType, setDotsType] = useState<DotType>("rounded");
  const [cornersType, setCornersType] = useState<CornerSquareType>("extra-rounded");
  const [cornerDotsType, setCornerDotsType] = useState<CornerDotType>("dot");
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<Extension>("png");
  const [resolution, setResolution] = useState(1000);

  const qrRef = useRef<HTMLDivElement>(null);
  const qrCode = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    qrCode.current = new QRCodeStyling({
      width: 300,
      height: 300,
      data: url,
      margin: 10,
      dotsOptions: {
        color: dotsColor,
        type: dotsType,
      },
      backgroundOptions: {
        color: bgColor,
      },
      cornersSquareOptions: {
        type: cornersType,
        color: dotsColor,
      },
      cornersDotOptions: {
        type: cornerDotsType,
        color: dotsColor,
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 5,
        imageSize: 0.4
      }
    });

    if (qrRef.current) {
      qrCode.current.append(qrRef.current);
    }

    return () => {
      if (qrRef.current) {
        qrRef.current.innerHTML = "";
      }
    };
  }, []);

  useEffect(() => {
    if (qrCode.current) {
      qrCode.current.update({
        data: url,
        dotsOptions: {
          color: dotsColor,
          type: dotsType,
        },
        backgroundOptions: {
          color: bgColor,
        },
        cornersSquareOptions: {
          type: cornersType,
          color: dotsColor,
        },
        cornersDotOptions: {
          type: cornerDotsType,
          color: dotsColor,
        },
        image: logo
      });
    }
  }, [url, dotsColor, bgColor, dotsType, cornersType, cornerDotsType, logo]);

  const handleDownload = () => {
    if (qrCode.current) {
      qrCode.current.download({
        name: "qr-studio-code",
        extension: downloadFormat,
      });
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogo(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetLogo = () => setLogo(undefined);

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-white font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Atmosphere */}
      <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-100px] left-[-100px] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto p-4 md:p-8 relative z-10">
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <RefreshCw className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 leading-none">
                QR STUDIO <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded ml-1 border border-indigo-500/30 align-middle">PRO</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Crea códigos QR profesionales</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-gray-400">
              v4.2.0
            </div>
          </div>
        </motion.header>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid lg:grid-cols-12 gap-8 items-start"
        >
          {/* Left Panel: Controls */}
          <div className="lg:col-span-7 space-y-6">
            <motion.section variants={itemVariants} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-2 mb-4 text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                <LinkIcon className="w-4 h-4" />
                <label>Source Destination</label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://tu-sitio.com"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-indigo-500 transition-colors text-lg"
                />
              </div>
            </motion.section>

            <motion.section variants={itemVariants} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-8 text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                <Palette className="w-4 h-4" />
                <label>Appearance Settings</label>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Colors */}
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 block">
                      Dot Architecture
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-xl shadow-inner border border-white/10 overflow-hidden relative bg-black/40">
                        <input
                          type="color"
                          value={dotsColor}
                          onChange={(e) => setDotsColor(e.target.value)}
                          className="absolute -inset-2 w-[200%] h-[200%] cursor-pointer border-none p-0 bg-transparent"
                        />
                      </div>
                      <input
                        type="text"
                        value={dotsColor}
                        onChange={(e) => setDotsColor(e.target.value)}
                        className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm font-mono uppercase text-gray-300 outline-none focus:border-indigo-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 block">
                      Canvas Base
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-xl shadow-inner border border-white/10 overflow-hidden relative bg-black/40">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="absolute -inset-2 w-[200%] h-[200%] cursor-pointer border-none p-0 bg-transparent"
                        />
                      </div>
                      <input
                        type="text"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm font-mono uppercase text-gray-300 outline-none focus:border-indigo-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Logo Upload */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 block">
                    Identity Mask (Optional)
                  </label>
                  <div className="space-y-3">
                    {!logo ? (
                      <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group hover:border-indigo-500/50">
                        <Upload className="w-10 h-10 text-white/20 group-hover:text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Sube tu logo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                    ) : (
                      <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1">
                        <div className="flex items-center gap-4 p-3 bg-black/20 rounded-xl">
                          <img src={logo} alt="Logo preview" className="w-16 h-16 object-contain bg-white rounded-xl p-2 shadow-sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">Identidad activa</p>
                            <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest mt-0.5">Vector Overlay</p>
                          </div>
                          <button 
                            onClick={resetLogo}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shapes */}
              <div className="mt-8 pt-8 border-t border-white/5 space-y-8">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 block">
                    Structure geometry
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'] as DotType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => setDotsType(type)}
                        className={`py-3 px-1 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all border ${
                          dotsType === type 
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30 scale-[1.05]" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        }`}
                      >
                        {type.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 block">
                      Frame curvature
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['square', 'dot', 'rounded', 'extra-rounded'] as CornerSquareType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setCornersType(type)}
                          className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all border ${
                            cornersType === type 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30" 
                              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                          }`}
                        >
                          {type.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 block">
                      Core focus
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                    {(['square', 'dot'] as CornerDotType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setCornerDotsType(type)}
                          className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all border ${
                            cornerDotsType === type 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30" 
                              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          {/* Right Panel: Preview & Download */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
            <motion.section variants={itemVariants} className="p-8 rounded-[48px] bg-gradient-to-br from-white/10 to-transparent border border-white/20 backdrop-blur-2xl shadow-[0_0_80px_-20px_rgba(99,102,241,0.2)] flex flex-col items-center">
              <div className="flex items-center gap-2 mb-8 w-full text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px] self-start">
                <Layout className="w-4 h-4" />
                <h2 className="text-xs">Live Matrix Render</h2>
              </div>
              
              <div className="relative group">
                <div className="absolute -inset-8 bg-indigo-500/10 rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-1000 -z-10 blur-[60px]" />
                <div 
                  className="rounded-2xl shadow-2xl transition-all duration-500 group-hover:scale-[1.02] overflow-hidden flex items-center justify-center border border-white/10" 
                  ref={qrRef} 
                  style={{ width: '300px', height: '300px', backgroundColor: bgColor }}
                />
              </div>

              <div className="w-full mt-10 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block text-center">
                      Export Profile
                    </label>
                    <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
                      {(["png", "svg", "webp", "jpeg"] as Extension[]).map((ext) => (
                        <button
                          key={ext}
                          onClick={() => setDownloadFormat(ext)}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${
                            downloadFormat === ext 
                              ? "bg-indigo-600 text-white shadow-lg" 
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                        >
                          {ext}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  className="group w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-5 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  <Download className="w-6 h-6" />
                  <span className="text-lg">DOWNLOAD VECTOR</span>
                </button>
                
                <div className="flex items-center justify-center gap-4 py-2 opacity-50">
                  <span className="h-px bg-white/10 flex-1" />
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.3em]">
                    4096 PX LOSSLESS
                  </p>
                  <span className="h-px bg-white/10 flex-1" />
                </div>
              </div>
            </motion.section>

            {/* Status Footer (Immersive UI footer style) */}
            <motion.footer variants={itemVariants} className="pt-4 border-t border-white/5 flex justify-between items-center px-4">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Engine: Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Resolution: <span className="text-gray-300">Ultra High</span></span>
                </div>
              </div>
              <span className="text-[9px] text-gray-600 font-bold uppercase tracking-wider">Aura v4.2 PRO</span>
            </motion.footer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

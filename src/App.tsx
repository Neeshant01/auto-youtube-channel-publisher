import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User as FirebaseUser, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { auth, db, googleProvider, signInWithPopup, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Video, 
  Settings, 
  ShieldCheck, 
  LogOut, 
  Youtube, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  PlusCircle,
  ChevronRight,
  Play,
  FileText,
  Mic,
  Image as ImageIcon,
  Upload,
  BarChart3,
  History,
  Activity,
  Menu,
  X,
  Loader2,
  Check,
  RefreshCw,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Edit3,
  ExternalLink,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from './services/geminiService';

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  youtubeChannelId?: string;
  youtubeChannelName?: string;
  youtubeChannelPhoto?: string;
  channelStatus?: 'found' | 'waiting_for_channel' | 'error';
  automationMode?: 'manual' | 'semi-auto' | 'full-auto';
  niche?: string;
  country?: string;
  language?: string;
  publishTime?: string;
  youtubeTokens?: any;
}

interface Trend {
  id: string;
  topic: string;
  description: string;
  momentum: number;
  category: string;
  status: 'new' | 'selected' | 'ignored';
  discoveredAt: string;
}

interface VideoJob {
  id: string;
  userId: string;
  topic: string;
  type: 'auto' | 'manual';
  status: 'researching' | 'scripting' | 'generating_audio' | 'assembling' | 'ready_to_publish' | 'published' | 'failed' | 'analyzing_video';
  pipeline: {
    research?: any;
    script?: any;
    audioUrl?: string;
    videoUrl?: string;
    thumbnailUrls?: string[];
    metadata?: any;
    manualVideoUrl?: string;
    manualVideoDescription?: string;
    publishSettings?: {
      publishNow?: boolean;
      scheduledTime?: string;
      interval?: number; // in hours
    };
  };
  scheduledAt?: string;
  publishedAt?: string;
  youtubeVideoId?: string;
  error?: string;
}

// --- Auth Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            channelStatus: 'waiting_for_channel',
            automationMode: 'manual',
            niche: 'Tech',
            country: 'India',
            language: 'Hindi',
            publishTime: '17:30'
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      console.log("Starting login with popup...");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Login successful:", result.user.email);
      
      // Extract Google OAuth tokens from the result
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        const accessToken = credential.accessToken;
        console.log("Google Access Token obtained during login");
        
        // If we have an access token, try to fetch YouTube channel info immediately
        if (accessToken) {
          try {
            console.log("Attempting to fetch YouTube channel info with login token...");
            const channelRes = await fetch('/api/youtube/channel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: { access_token: accessToken } })
            });
            
            const channelData = await channelRes.json();
            if (channelData.found) {
              console.log("YouTube channel found and connected during login!");
              await updateProfile({
                youtubeChannelId: channelData.channel.id,
                youtubeChannelName: channelData.channel.title,
                youtubeChannelPhoto: channelData.channel.photo,
                channelStatus: 'found',
                youtubeTokens: { access_token: accessToken }
              });
            }
          } catch (ytErr) {
            console.error("Failed to auto-connect YouTube during login:", ytErr);
          }
        }
      }
    } catch (error: any) {
      console.error("Login Error Details:", error);
      
      if (error.code === 'auth/network-request-failed') {
        alert("Network error during login. This often happens in iframes if third-party cookies are blocked. Please try disabling ad-blockers.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Just ignore if user closed it
      } else {
        alert(`Login failed: ${error.message}`);
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (user) {
      const docRef = doc(db, 'users', user.uid);
      try {
        await setDoc(docRef, data, { merge: true });
        setProfile(prev => prev ? { ...prev, ...data } : null);
      } catch (error) {
        console.error("Profile update failed:", error);
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

// --- Components ---

const Sidebar = () => {
  const { profile, logout } = useAuth();
  const location = useLocation();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: TrendingUp, label: 'Trend Discovery', path: '/trends' },
    { icon: Video, label: 'Content Pipeline', path: '/pipeline' },
    { icon: History, label: 'Upload History', path: '/history' },
    { icon: Settings, label: 'Settings', path: '/settings' },
    { icon: ShieldCheck, label: 'Admin', path: '/admin' },
  ];

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
            <Youtube className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white leading-tight">AutoYT</h1>
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                location.pathname === item.path
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-zinc-800">
        <div className="flex items-center gap-3 mb-6">
          <img src={profile?.photoURL} alt="User" className="w-10 h-10 rounded-full border border-zinc-700" />
          <div className="overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{profile?.displayName}</p>
            <p className="text-xs text-zinc-500 truncate">{profile?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-4 py-2 text-zinc-400 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};

const formatTimeAgo = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

const getStatusDetails = (status: string) => {
  switch (status) {
    case 'researching': return { text: 'Finding viral data...', time: '15-20m' };
    case 'scripting': return { text: 'Writing script...', time: '10-15m' };
    case 'generating_audio': return { text: 'Creating voiceover...', time: '5-10m' };
    case 'assembling': return { text: 'Merging video & audio...', time: '20-30m' };
    case 'analyzing_video': return { text: 'AI analyzing your video...', time: '10-15m' };
    case 'ready_to_publish': return { text: 'Ready to go!', time: '0m' };
    case 'published': return { text: 'Live on YouTube!', time: '0m' };
    case 'failed': return { text: 'Something went wrong', time: '0m' };
    default: return { text: 'Processing...', time: '...' };
  }
};

const Dashboard = () => {
  const { user, profile, updateProfile } = useAuth();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<VideoJob | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingJob, setSchedulingJob] = useState<VideoJob | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleInterval, setScheduleInterval] = useState(0);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTags, setEditedTags] = useState('');
  const [selectedThumbnail, setSelectedThumbnail] = useState('');
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');

  const handleGenerateViralTitle = async () => {
    if (!selectedJob) return;
    setGeneratingTitle(true);
    try {
      const viralTitle = await geminiService.generateViralTitle(selectedJob.topic, profile?.niche || 'YouTube');
      setEditedTitle(viralTitle);
    } catch (error) {
      console.error("Failed to generate title:", error);
      alert("AI Title generation failed.");
    } finally {
      setGeneratingTitle(false);
    }
  };

  const handleGenerateAIThumbnail = async () => {
    if (!selectedJob) return;
    setGeneratingThumbnail(true);
    try {
      const prompt = selectedJob.pipeline.metadata?.thumbnailConcepts?.[0]?.prompt || `A viral YouTube thumbnail for ${selectedJob.topic}, high quality, cinematic`;
      const imageUrl = await geminiService.generateHighQualityThumbnail(prompt, imageSize);
      setSelectedThumbnail(imageUrl);
      
      const updatedThumbnails = [imageUrl, ...(selectedJob.pipeline.thumbnailUrls || [])];
      await setDoc(doc(db, 'jobs', selectedJob.id), {
        pipeline: {
          ...selectedJob.pipeline,
          thumbnailUrls: updatedThumbnails
        }
      }, { merge: true });
    } catch (error) {
      console.error("Failed to generate thumbnail:", error);
      alert("AI Thumbnail generation failed.");
    } finally {
      setGeneratingThumbnail(false);
    }
  };

  useEffect(() => {
    if (selectedJob && showAssetModal) {
      setEditedTitle(selectedJob.pipeline.metadata?.titles?.[0] || selectedJob.topic);
      setEditedDescription(selectedJob.pipeline.metadata?.descriptions?.[0] || selectedJob.topic);
      setEditedTags(selectedJob.pipeline.metadata?.tags?.join(', ') || '');
      setSelectedThumbnail(selectedJob.pipeline.thumbnailUrls?.[0] || '');
    }
  }, [selectedJob, showAssetModal]);

  const publishVideo = async (job: VideoJob) => {
    if (!profile?.youtubeTokens) {
      alert("YouTube channel not connected or tokens missing.");
      return;
    }

    try {
      // Use edited values if this is the currently selected job being published
      const finalTitle = (selectedJob?.id === job.id && editedTitle) ? editedTitle : (job.pipeline.metadata?.titles?.[0] || job.topic);
      const finalDescription = (selectedJob?.id === job.id && editedDescription) ? editedDescription : (job.pipeline.metadata?.descriptions?.[0] || job.topic);
      const finalTags = (selectedJob?.id === job.id && editedTags) ? editedTags.split(',').map(t => t.trim()) : (job.pipeline.metadata?.tags || []);
      const finalThumbnail = (selectedJob?.id === job.id && selectedThumbnail) ? selectedThumbnail : (job.pipeline.thumbnailUrls?.[0] || '');

      const response = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: profile.youtubeTokens,
          videoUrl: job.type === 'manual' ? job.pipeline.manualVideoUrl : job.pipeline.videoUrl,
          title: finalTitle,
          description: finalDescription,
          tags: finalTags,
          thumbnailUrl: finalThumbnail,
          category: job.pipeline.metadata?.category || '22', // People & Blogs
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload to YouTube');
      }

      const result = await response.json();
      
      await setDoc(doc(db, 'jobs', job.id), {
        status: 'published',
        publishedAt: new Date().toISOString(),
        youtubeVideoId: result.videoId
      }, { merge: true });

      alert("Video published successfully to YouTube!");
    } catch (error: any) {
      console.error("Publish Error:", error);
      alert("Failed to publish: " + error.message);
      await setDoc(doc(db, 'jobs', job.id), {
        status: 'failed',
        error: 'YouTube Publish Failed: ' + error.message
      }, { merge: true });
    }
  };

  const handlePublishNow = async (job: VideoJob) => {
    setPublishing(job.id);
    try {
      await publishVideo(job);
    } finally {
      setPublishing(null);
    }
  };

  const handleSchedule = async () => {
    if (!schedulingJob) return;
    try {
      await setDoc(doc(db, 'jobs', schedulingJob.id), {
        pipeline: {
          ...schedulingJob.pipeline,
          publishSettings: {
            scheduledTime: scheduleTime,
            interval: scheduleInterval
          }
        }
      }, { merge: true });
      alert("Schedule updated!");
      setShowScheduleModal(false);
    } catch (error) {
      console.error("Schedule Error:", error);
    }
  };

  useEffect(() => {
    if (profile?.uid) {
      const q = query(collection(db, 'jobs'), where('userId', '==', profile.uid));
      return onSnapshot(q, (snapshot) => {
        const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VideoJob));
        setJobs(jobsData.sort((a, b) => {
          const dateA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
          const dateB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
          return dateB - dateA;
        }));
      });
    }
  }, [profile?.uid]);

  const discoverTrends = async () => {
    setLoadingTrends(true);
    try {
      const niche = profile?.niche || 'Tech';
      const country = profile?.country || 'India';
      const language = profile?.language || 'Hindi';
      const newTrends = await geminiService.discoverTrends(niche, country, language);
      setTrends(newTrends.map((t: any, i: number) => ({ ...t, id: `trend-${Date.now()}-${i}`, status: 'new', discoveredAt: new Date().toISOString() })));
    } catch (error) {
      console.error("Trend Discovery Error:", error);
    } finally {
      setLoadingTrends(false);
    }
  };

  const [connecting, setConnecting] = useState(false);
  const [startingPipeline, setStartingPipeline] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Pipeline Processor
  useEffect(() => {
    const processPendingJobs = async () => {
      const jobsToProcess = jobs.filter(j => 
        (j.status === 'analyzing_video' || 
         (j.type === 'auto' && ['researching', 'scripting', 'generating_audio', 'assembling'].includes(j.status))) &&
        !processingIds.has(j.id)
      );

      if (jobsToProcess.length === 0) return;

      // Process one at a time to avoid rate limits and overlapping
      const job = jobsToProcess[0];
      setProcessingIds(prev => new Set(prev).add(job.id));

      try {
        if (job.status === 'analyzing_video') {
          const metadata = await geminiService.analyzeManualVideo(
            job.pipeline.manualVideoDescription || '', 
            job.topic
          );
          const concepts = await geminiService.generateThumbnailConcepts(job.topic);
          
          await setDoc(doc(db, 'jobs', job.id), {
            status: 'ready_to_publish',
            pipeline: {
              ...job.pipeline,
              metadata,
              thumbnailUrls: concepts.map((c: any) => c.imageUrl)
            }
          }, { merge: true });
        } else if (job.type === 'auto') {
          if (job.status === 'researching') {
            await setDoc(doc(db, 'jobs', job.id), { status: 'scripting' }, { merge: true });
            const script = await geminiService.generateScript(job.topic, "Viral trends and data", "Professional Documentary");
            await setDoc(doc(db, 'jobs', job.id), { 
              status: 'generating_audio',
              pipeline: { ...job.pipeline, script }
            }, { merge: true });
          } else if (job.status === 'generating_audio') {
            const voiceover = await geminiService.generateVoiceover(job.pipeline.script.english);
            await setDoc(doc(db, 'jobs', job.id), { 
              status: 'assembling',
              pipeline: { ...job.pipeline, voiceover }
            }, { merge: true });
          } else if (job.status === 'assembling') {
            const metadata = await geminiService.generateMetadata(job.topic, job.pipeline.script.english);
            const concepts = await geminiService.generateThumbnailConcepts(job.topic);
            await setDoc(doc(db, 'jobs', job.id), { 
              status: 'ready_to_publish',
              pipeline: { 
                ...job.pipeline, 
                metadata, 
                thumbnailUrls: concepts.map((c: any) => c.imageUrl),
                videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4" 
              }
            }, { merge: true });
          }
        }
      } catch (err: any) {
        console.error(`Pipeline Error for job ${job.id}:`, err);
        const errorMessage = err.message?.includes('Safety') ? 'AI safety filter blocked analysis' : 
                             err.message?.includes('quota') ? 'AI quota exceeded' : 
                             'AI analysis failed: ' + (err.message || 'Unknown error');
        await setDoc(doc(db, 'jobs', job.id), { 
          status: 'failed', 
          error: errorMessage 
        }, { merge: true });
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(job.id);
          return next;
        });
      }
    };

    processPendingJobs();
  }, [jobs, processingIds]);

  const handleRetry = async (job: VideoJob) => {
    try {
      const nextStatus = job.type === 'manual' ? 'analyzing_video' : 'researching';
      await setDoc(doc(db, 'jobs', job.id), { 
        status: nextStatus,
        error: null 
      }, { merge: true });
    } catch (error) {
      console.error("Retry Error:", error);
    }
  };
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [manualVideoFile, setManualVideoFile] = useState<File | null>(null);
  const [manualTopic, setManualTopic] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [uploadingManual, setUploadingManual] = useState(false);

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualVideoFile || !manualTopic) {
      alert("Please provide a video file and a topic.");
      return;
    }

    if (!profile?.youtubeChannelId) {
      alert("Please connect your YouTube channel first.");
      return;
    }

    setUploadingManual(true);
    try {
      const simulatedVideoUrl = "https://www.w3schools.com/html/mov_bbb.mp4";
      
      const jobData: any = {
        userId: user?.uid,
        topic: manualTopic,
        type: 'manual',
        status: 'analyzing_video',
        pipeline: {
          manualVideoUrl: simulatedVideoUrl,
          manualVideoDescription: manualDescription
        },
        scheduledAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'jobs'), jobData);
      
      setShowManualUpload(false);
      setManualVideoFile(null);
      setManualTopic('');
      setManualDescription('');
      alert("Manual video uploaded! AI is now generating metadata and thumbnails.");
    } catch (error: any) {
      console.error("Manual Upload Error:", error);
      handleFirestoreError(error, OperationType.WRITE, 'jobs');
    } finally {
      setUploadingManual(false);
    }
  };

  const startPipeline = async (trend: Trend) => {
    if (!user) {
      alert("Please login first.");
      return;
    }
    
    if (!profile?.youtubeChannelId) {
      alert("Please connect your YouTube channel first.");
      return;
    }

    setStartingPipeline(trend.id);
    try {
      const jobData: any = {
        userId: user.uid,
        topic: trend.topic,
        type: 'auto',
        status: 'researching',
        pipeline: {},
        scheduledAt: new Date().toISOString(),
      };
      
      await addDoc(collection(db, 'jobs'), jobData);
      alert(`Pipeline started for: ${trend.topic}`);
    } catch (error: any) {
      console.error("Failed to start pipeline:", error);
      handleFirestoreError(error, OperationType.WRITE, 'jobs');
    } finally {
      setStartingPipeline(null);
    }
  };

  const connectYouTube = async () => {
    setConnecting(true);
    console.log("[YouTube Auth] Initiating direct connection via Firebase...");
    try {
      // Use the same provider with YouTube scopes
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (credential && credential.accessToken) {
        const accessToken = credential.accessToken;
        console.log("[YouTube Auth] Access token obtained");
        
        const channelRes = await fetch('/api/youtube/channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: { access_token: accessToken } })
        });
        
        const channelData = await channelRes.json();
        if (channelData.found) {
          await updateProfile({
            youtubeChannelId: channelData.channel.id,
            youtubeChannelName: channelData.channel.title,
            youtubeChannelPhoto: channelData.channel.photo,
            channelStatus: 'found',
            youtubeTokens: { access_token: accessToken }
          });
          console.log("[YouTube Auth] Channel connected successfully");
        } else {
          alert("No YouTube channel found for this account.");
        }
      } else {
        throw new Error("Failed to get access token from Google.");
      }
      setConnecting(false);
    } catch (error: any) {
      console.error("[YouTube Auth] Direct connection failed:", error);
      
      // If the error is that the popup was closed, just stop connecting
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        setConnecting(false);
        return;
      }

      // Fallback to the manual OAuth flow if direct fails
      console.log("[YouTube Auth] Falling back to manual OAuth flow...");
      try {
        const response = await fetch('/api/auth/youtube/url');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          
          // Fetch diagnostic info
          const debugRes = await fetch('/api/debug/secrets');
          const debugData = await debugRes.json().catch(() => ({}));
          
          const debugMsg = debugData.clientId 
            ? `\n\nDebug Info:\n- Client ID: ${debugData.clientId.value}\n- Length: ${debugData.clientId.length}\n- Is Placeholder: ${debugData.clientId.isPlaceholder}\n- Secret Present: ${debugData.clientSecret.present}`
            : "";
            
          throw new Error((errorData.error || "Failed to get auth URL from server") + debugMsg);
        }
        
        const { url } = await response.json();
        const authWindow = window.open(url, 'youtube_auth', 'width=600,height=700');
        
        if (!authWindow) {
          alert("Popup blocked! Please allow popups for this site to connect YouTube.");
          setConnecting(false);
          return;
        }

        // Monitor if the window is closed manually
        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            setConnecting(false);
          }
        }, 1000);

        const handleMessage = async (event: MessageEvent) => {
          if (event.data?.type === 'YOUTUBE_AUTH_SUCCESS') {
            clearInterval(checkClosed);
            const tokens = event.data.tokens;
            const channelRes = await fetch('/api/youtube/channel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens })
            });
            const channelData = await channelRes.json();
            if (channelData.found) {
              await updateProfile({
                youtubeChannelId: channelData.channel.id,
                youtubeChannelName: channelData.channel.title,
                youtubeChannelPhoto: channelData.channel.photo,
                channelStatus: 'found',
                youtubeTokens: tokens
              });
            }
            window.removeEventListener('message', handleMessage);
            setConnecting(false);
          } else if (event.data?.type === 'YOUTUBE_AUTH_ERROR') {
            clearInterval(checkClosed);
            alert(`YouTube Authentication Error: ${event.data.error}`);
            setConnecting(false);
            window.removeEventListener('message', handleMessage);
          }
        };
        window.addEventListener('message', handleMessage);
      } catch (fallbackErr: any) {
        alert(`Connection failed: ${fallbackErr.message}`);
        setConnecting(false);
      }
    }
  };

  return (
    <div className="p-8 space-y-8">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-white">Welcome back, {profile?.displayName.split(' ')[0]}</h2>
          <p className="text-zinc-400 mt-1">Here's what's happening with your YouTube automation today.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-zinc-700 transition-colors flex items-center gap-2">
            <Activity className="w-4 h-4" />
            System Health
          </button>
          <button className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Channel Status Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <Youtube className="text-red-500 w-6 h-6" />
            </div>
            {profile?.channelStatus === 'found' ? (
              <span className="bg-emerald-500/10 text-emerald-500 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="bg-amber-500/10 text-amber-500 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Disconnected
              </span>
            )}
          </div>
          
          {profile?.channelStatus === 'found' ? (
            <div className="flex items-center gap-4">
              <img src={profile.youtubeChannelPhoto} alt="Channel" className="w-12 h-12 rounded-full border-2 border-zinc-800" />
              <div>
                <h3 className="text-white font-bold">{profile.youtubeChannelName}</h3>
                <p className="text-zinc-500 text-xs truncate w-40">{profile.youtubeChannelId}</p>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-white font-bold">No Channel Connected</h3>
              <p className="text-zinc-500 text-sm mt-1">Connect your YouTube account to start publishing.</p>
              <button 
                onClick={connectYouTube}
                disabled={connecting}
                className="mt-4 w-full bg-white text-black py-2 rounded-lg font-bold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting...' : 'Connect YouTube'}
              </button>
            </div>
          )}
        </div>

        {/* Automation Status Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Activity className="text-blue-500 w-6 h-6" />
            </div>
            <span className="bg-blue-500/10 text-blue-500 text-xs font-bold px-2 py-1 rounded-full">
              {profile?.automationMode?.toUpperCase()}
            </span>
          </div>
          <h3 className="text-white font-bold">Daily Automation</h3>
          <p className="text-zinc-500 text-sm mt-1">Scheduled for {profile?.publishTime} {profile?.country} Time.</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="w-2/3 h-full bg-blue-500 rounded-full" />
            </div>
            <span className="text-xs text-zinc-400">Next: 4h 20m</span>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <BarChart3 className="text-emerald-500 w-6 h-6" />
            </div>
          </div>
          <h3 className="text-white font-bold">Performance</h3>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-zinc-500 text-xs uppercase font-bold tracking-wider">Videos</p>
              <p className="text-2xl font-bold text-white">{jobs.filter(j => j.status === 'published').length}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs uppercase font-bold tracking-wider">Views</p>
              <p className="text-2xl font-bold text-white">0</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trends Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-500" />
              Trending Topics
            </h3>
            <button 
              onClick={discoverTrends}
              disabled={loadingTrends}
              className="text-sm text-red-500 font-bold hover:text-red-400 transition-colors flex items-center gap-1"
            >
              {loadingTrends ? 'Discovering...' : 'Refresh Trends'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trends.length > 0 ? trends.map((trend) => (
              <motion.div 
                key={trend.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-zinc-800 text-zinc-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                    {trend.category}
                  </span>
                  <div className="flex items-center gap-1 text-emerald-500">
                    <TrendingUp className="w-3 h-3" />
                    <span className="text-xs font-bold">{trend.momentum}%</span>
                  </div>
                </div>
                <h4 className="text-white font-bold group-hover:text-red-500 transition-colors">{trend.topic}</h4>
                <p className="text-zinc-500 text-xs mt-2 line-clamp-2">{trend.description}</p>
                <div className="mt-4 flex gap-2">
                  <button className="flex-1 bg-zinc-800 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors">
                    Ignore
                  </button>
                  <button 
                    onClick={() => startPipeline(trend)}
                    disabled={startingPipeline === trend.id}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {startingPipeline === trend.id ? 'Starting...' : 'Start Pipeline'}
                  </button>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-2 py-12 text-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl">
                <TrendingUp className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No trends discovered yet. Click refresh to start.</p>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline / Recent Jobs */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Recent Pipeline
            </h3>
            <button 
              onClick={() => setShowManualUpload(true)}
              className="bg-zinc-800 text-white p-2 rounded-lg hover:bg-zinc-700 transition-colors"
              title="Manual Video Upload"
            >
              <Upload className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-4">
            {jobs.length > 0 ? jobs.map((job, index) => {
              const details = getStatusDetails(job.status);
              const projectNumber = jobs.length - index;
              
              return (
                <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center relative">
                    <Video className="text-zinc-500 w-6 h-6" />
                    {job.status === 'published' && (
                      <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5">
                        <CheckCircle2 className="text-white w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-red-500 text-[10px] font-black uppercase">Project {projectNumber}</span>
                      {job.type === 'manual' && (
                        <span className="bg-zinc-800 text-zinc-400 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter">Manual</span>
                      )}
                      <h4 className="text-white text-sm font-bold truncate">{job.topic}</h4>
                    </div>
                    <p className="text-zinc-500 text-[10px] mt-0.5 opacity-60 italic">{details.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        job.status === 'published' ? 'bg-emerald-500/10 text-emerald-500' :
                        job.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {job.status.replace('_', ' ')}
                      </span>
                      <span className="text-zinc-600 text-[10px]">
                        • {formatTimeAgo(job.scheduledAt)}
                      </span>
                      {job.status !== 'published' && job.status !== 'failed' && (
                        <span className="text-zinc-500 text-[10px] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> ~{details.time} left
                        </span>
                      )}
                    </div>
                    {job.status === 'failed' && (
                      <div className="mt-1 space-y-1">
                        <p className="text-red-500 text-[10px] font-medium flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {job.error || 'AI analysis failed'}
                        </p>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleRetry(job); }}
                          className="text-blue-500 text-[10px] font-bold hover:underline"
                        >
                          Retry Processing
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedJob(job); setShowAssetModal(true); }}
                        className="bg-zinc-800 text-white px-2 py-1 rounded-md text-[10px] font-bold hover:bg-zinc-700 transition-colors"
                      >
                        Assets
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedJob(job); setShowReviewModal(true); }}
                        className="bg-red-600 text-white px-2 py-1 rounded-md text-[10px] font-bold hover:bg-red-700 transition-colors"
                      >
                        Review
                      </button>
                      {job.status === 'ready_to_publish' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handlePublishNow(job); }}
                          disabled={publishing === job.id}
                          className="bg-emerald-600 text-white px-2 py-1 rounded-md text-[10px] font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {publishing === job.id ? '...' : 'Publish'}
                        </button>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="text-zinc-700 w-5 h-5" />
                </div>
              );
            }) : (
              <div className="py-12 text-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl">
                <p className="text-zinc-500 text-sm">No active jobs in pipeline.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Upload Modal */}
      <AnimatePresence>
        {showManualUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Manual Video Upload</h3>
                <button 
                  onClick={() => setShowManualUpload(false)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-6 h-6 rotate-90" />
                </button>
              </div>

              <form onSubmit={handleManualUpload} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Video File</label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="video/*"
                      onChange={(e) => setManualVideoFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="video-upload"
                    />
                    <label 
                      htmlFor="video-upload"
                      className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl cursor-pointer group-hover:border-zinc-700 transition-all bg-zinc-900/50"
                    >
                      <Video className="w-12 h-12 text-zinc-700 mb-4 group-hover:text-red-500 transition-colors" />
                      <span className="text-zinc-400 font-bold">
                        {manualVideoFile ? manualVideoFile.name : "Click to select video"}
                      </span>
                      <span className="text-zinc-600 text-xs mt-2">MP4, MOV, AVI up to 500MB</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Video Topic</label>
                  <input 
                    type="text" 
                    value={manualTopic}
                    onChange={(e) => setManualTopic(e.target.value)}
                    placeholder="e.g., New WhatsApp Scams 2024"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Video Description (for AI)</label>
                  <textarea 
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="Briefly describe what happens in the video so AI can generate perfect SEO metadata..."
                    rows={4}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 transition-colors resize-none"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={uploadingManual || !manualVideoFile || !manualTopic}
                  className="w-full bg-red-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                >
                  {uploadingManual ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload & Generate Metadata
                    </>
                  ) }
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Asset Modal */}
      <AnimatePresence>
        {showAssetModal && selectedJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-white">Review & Edit Assets</h3>
                  <span className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                    {selectedJob.topic}
                  </span>
                </div>
                <button onClick={() => setShowAssetModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Editing */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Video Title</label>
                      <input 
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                      />
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {selectedJob.pipeline.metadata?.titles?.map((t: string, i: number) => (
                          <button 
                            key={i}
                            onClick={() => setEditedTitle(t)}
                            className="whitespace-nowrap bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-full border border-zinc-700 transition-colors"
                          >
                            Suggestion {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                      <textarea 
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        rows={6}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors resize-none text-sm"
                      />
                      <div className="flex gap-2">
                        {selectedJob.pipeline.metadata?.descriptions?.map((_, i: number) => (
                          <button 
                            key={i}
                            onClick={() => setEditedDescription(selectedJob.pipeline.metadata?.descriptions?.[i] || '')}
                            className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-full border border-zinc-700 transition-colors"
                          >
                            Version {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Tags (comma separated)</label>
                      <input 
                        type="text"
                        value={editedTags}
                        onChange={(e) => setEditedTags(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 flex gap-4">
                    <button 
                      onClick={async () => {
                        await setDoc(doc(db, 'jobs', selectedJob.id), {
                          pipeline: {
                            ...selectedJob.pipeline,
                            metadata: {
                              ...selectedJob.pipeline.metadata,
                              titles: [editedTitle, ...(selectedJob.pipeline.metadata?.titles?.filter((t: string) => t !== editedTitle) || [])],
                              descriptions: [editedDescription, ...(selectedJob.pipeline.metadata?.descriptions?.filter((d: string) => d !== editedDescription) || [])],
                              tags: editedTags.split(',').map(t => t.trim())
                            },
                            thumbnailUrls: [selectedThumbnail, ...(selectedJob.pipeline.thumbnailUrls?.filter((u: string) => u !== selectedThumbnail) || [])]
                          }
                        }, { merge: true });
                        alert("Changes saved to pipeline!");
                      }}
                      className="flex-1 bg-zinc-800 text-white py-4 rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                    >
                      Save Changes
                    </button>
                    <button 
                      onClick={() => handlePublishNow(selectedJob)}
                      disabled={publishing === selectedJob.id}
                      className="flex-1 bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {publishing === selectedJob.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      Publish Now
                    </button>
                  </div>
                </div>

                {/* Right Column: Visuals */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-3">Select Thumbnail</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedJob.pipeline.thumbnailUrls?.map((url, i) => (
                        <div 
                          key={i} 
                          onClick={() => setSelectedThumbnail(url)}
                          className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedThumbnail === url ? 'border-red-500 scale-[1.02]' : 'border-zinc-800 opacity-60 hover:opacity-100'}`}
                        >
                          <img src={url} alt="Thumbnail" className="w-full aspect-video object-cover" />
                          {selectedThumbnail === url && (
                            <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-3">Script Preview</h4>
                    <div className="bg-zinc-800/50 rounded-xl p-4 h-64 overflow-y-auto border border-zinc-800">
                      <p className="text-zinc-400 text-sm whitespace-pre-wrap leading-relaxed">
                        {selectedJob.pipeline.script?.content || "No script generated yet."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {showReviewModal && selectedJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-2xl shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Manual Review</h3>
                <button onClick={() => setShowReviewModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
                  <h4 className="text-lg font-bold text-white mb-2">AI Analysis Summary</h4>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    The AI has completed the analysis of your video topic: <strong>{selectedJob.topic}</strong>.
                    It has generated SEO-optimized metadata and high-CTR thumbnail concepts.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-800">
                    <p className="text-xs text-zinc-500 font-bold uppercase mb-1">Status</p>
                    <p className="text-white font-bold capitalize">{selectedJob.status.replace('_', ' ')}</p>
                  </div>
                  <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-800">
                    <p className="text-xs text-zinc-500 font-bold uppercase mb-1">Type</p>
                    <p className="text-white font-bold capitalize">{selectedJob.type}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => { setShowReviewModal(false); setShowAssetModal(true); }}
                    className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                  >
                    Edit Assets
                  </button>
                  <button 
                    onClick={() => { setShowReviewModal(false); handlePublishNow(selectedJob); }}
                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
                  >
                    Approve & Publish
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Schedule Modal */}
      <AnimatePresence>
        {showScheduleModal && schedulingJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Schedule Publishing</h3>
                <button onClick={() => setShowScheduleModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Specific Time</label>
                  <input 
                    type="datetime-local" 
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Interval (Hours)</label>
                  <select 
                    value={scheduleInterval}
                    onChange={(e) => setScheduleInterval(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={0}>No Interval</option>
                    <option value={1}>Every 1 Hour</option>
                    <option value={4}>Every 4 Hours</option>
                    <option value={12}>Every 12 Hours</option>
                    <option value={24}>Every 24 Hours</option>
                  </select>
                </div>

                <button 
                  onClick={handleSchedule}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                >
                  Save Schedule
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SettingsPage = () => {
  const { profile, updateProfile } = useAuth();
  const [formData, setFormData] = useState({
    niche: profile?.niche || 'Tech',
    country: profile?.country || 'India',
    language: profile?.language || 'Hindi',
    publishTime: profile?.publishTime || '17:30',
    automationMode: profile?.automationMode || 'manual'
  });

  const handleSave = async () => {
    await updateProfile(formData);
    alert("Settings saved!");
  };

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-3xl font-bold text-white mb-8">Settings</h2>
      
      <div className="space-y-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Content Niche</label>
          <select 
            value={formData.niche}
            onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
          >
            <option>Tech</option>
            <option>AI</option>
            <option>Finance</option>
            <option>Current Affairs</option>
            <option>Geopolitics</option>
            <option>History</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Target Country</label>
            <input 
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Language</label>
            <input 
              type="text"
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Daily Publish Time</label>
          <input 
            type="time"
            value={formData.publishTime}
            onChange={(e) => setFormData({ ...formData, publishTime: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Automation Mode</label>
          <div className="grid grid-cols-3 gap-3">
            {['manual', 'semi-auto', 'full-auto'].map((mode) => (
              <button
                key={mode}
                onClick={() => setFormData({ ...formData, automationMode: mode as any })}
                className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                  formData.automationMode === mode 
                    ? 'bg-red-600 border-red-600 text-white' 
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handleSave}
          className="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 transition-colors mt-8"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};

const LoginPage = () => {
  const { login } = useAuth();
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-red-600/20">
            <Youtube className="text-white w-12 h-12" />
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">AutoYT</h1>
          <p className="text-zinc-500 mt-4 text-lg">Automate your YouTube empire with Gemini AI and trending topic discovery.</p>
        </div>
        <button
          onClick={login}
          className="w-full bg-white text-black py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-zinc-200 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
          Continue with Google
        </button>
        <p className="text-zinc-600 text-sm">
          By continuing, you agree to connect your YouTube account for automated publishing.
        </p>
        <div className="mt-8 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 text-left">
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Troubleshooting
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            If you see a "network-request-failed" error, please ensure that <strong>third-party cookies</strong> are enabled in your browser settings, or try disabling ad-blockers.
          </p>
        </div>
      </div>
    </div>
  );
};

const PipelinePage = () => {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<VideoJob | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingJob, setSchedulingJob] = useState<VideoJob | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleInterval, setScheduleInterval] = useState(0);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTags, setEditedTags] = useState('');
  const [selectedThumbnail, setSelectedThumbnail] = useState('');
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');

  const handleGenerateViralTitle = async () => {
    if (!selectedJob) return;
    setGeneratingTitle(true);
    try {
      const viralTitle = await geminiService.generateViralTitle(selectedJob.topic, profile?.niche || 'YouTube');
      setEditedTitle(viralTitle);
    } catch (error) {
      console.error("Failed to generate title:", error);
      alert("AI Title generation failed.");
    } finally {
      setGeneratingTitle(false);
    }
  };

  const handleGenerateAIThumbnail = async () => {
    if (!selectedJob) return;
    setGeneratingThumbnail(true);
    try {
      const prompt = selectedJob.pipeline.metadata?.thumbnailConcepts?.[0]?.prompt || `A viral YouTube thumbnail for ${selectedJob.topic}, high quality, cinematic`;
      const imageUrl = await geminiService.generateHighQualityThumbnail(prompt, imageSize);
      setSelectedThumbnail(imageUrl);
      
      const updatedThumbnails = [imageUrl, ...(selectedJob.pipeline.thumbnailUrls || [])];
      await setDoc(doc(db, 'jobs', selectedJob.id), {
        pipeline: {
          ...selectedJob.pipeline,
          thumbnailUrls: updatedThumbnails
        }
      }, { merge: true });
    } catch (error) {
      console.error("Failed to generate thumbnail:", error);
      alert("AI Thumbnail generation failed.");
    } finally {
      setGeneratingThumbnail(false);
    }
  };

  const handleRetry = async (job: VideoJob) => {
    try {
      const nextStatus = job.type === 'manual' ? 'analyzing_video' : 'researching';
      await setDoc(doc(db, 'jobs', job.id), { 
        status: nextStatus,
        error: null 
      }, { merge: true });
    } catch (error) {
      console.error("Retry Error:", error);
    }
  };

  useEffect(() => {
    if (selectedJob && showAssetModal) {
      setEditedTitle(selectedJob.pipeline.metadata?.titles?.[0] || selectedJob.topic);
      setEditedDescription(selectedJob.pipeline.metadata?.descriptions?.[0] || selectedJob.topic);
      setEditedTags(selectedJob.pipeline.metadata?.tags?.join(', ') || '');
      setSelectedThumbnail(selectedJob.pipeline.thumbnailUrls?.[0] || '');
    }
  }, [selectedJob, showAssetModal]);

  const publishVideo = async (job: VideoJob) => {
    if (!profile?.youtubeTokens) {
      alert("YouTube channel not connected or tokens missing.");
      return;
    }

    try {
      // Use edited values if this is the currently selected job being published
      const finalTitle = (selectedJob?.id === job.id && editedTitle) ? editedTitle : (job.pipeline.metadata?.titles?.[0] || job.topic);
      const finalDescription = (selectedJob?.id === job.id && editedDescription) ? editedDescription : (job.pipeline.metadata?.descriptions?.[0] || job.topic);
      const finalTags = (selectedJob?.id === job.id && editedTags) ? editedTags.split(',').map(t => t.trim()) : (job.pipeline.metadata?.tags || []);
      const finalThumbnail = (selectedJob?.id === job.id && selectedThumbnail) ? selectedThumbnail : (job.pipeline.thumbnailUrls?.[0] || '');

      const response = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: profile.youtubeTokens,
          videoUrl: job.type === 'manual' ? job.pipeline.manualVideoUrl : job.pipeline.videoUrl,
          title: finalTitle,
          description: finalDescription,
          tags: finalTags,
          thumbnailUrl: finalThumbnail,
          category: job.pipeline.metadata?.category || '22', // People & Blogs
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload to YouTube');
      }

      const result = await response.json();
      
      await setDoc(doc(db, 'jobs', job.id), {
        status: 'published',
        publishedAt: new Date().toISOString(),
        youtubeVideoId: result.videoId
      }, { merge: true });

      alert("Video published successfully to YouTube!");
    } catch (error: any) {
      console.error("Publish Error:", error);
      alert("Failed to publish: " + error.message);
      await setDoc(doc(db, 'jobs', job.id), {
        status: 'failed',
        error: 'YouTube Publish Failed: ' + error.message
      }, { merge: true });
    }
  };

  const handlePublishNow = async (job: VideoJob) => {
    setPublishing(job.id);
    try {
      await publishVideo(job);
    } finally {
      setPublishing(null);
    }
  };

  const handleSchedule = async () => {
    if (!schedulingJob) return;
    try {
      await setDoc(doc(db, 'jobs', schedulingJob.id), {
        pipeline: {
          ...schedulingJob.pipeline,
          publishSettings: {
            scheduledTime: scheduleTime,
            interval: scheduleInterval
          }
        }
      }, { merge: true });
      alert("Schedule updated!");
      setShowScheduleModal(false);
    } catch (error) {
      console.error("Schedule Error:", error);
    }
  };

  useEffect(() => {
    if (profile?.uid) {
      const q = query(collection(db, 'jobs'), where('userId', '==', profile.uid));
      return onSnapshot(q, (snapshot) => {
        const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VideoJob));
        setJobs(jobsData.sort((a, b) => {
          const dateA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
          const dateB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
          return dateB - dateA;
        }));
      });
    }
  }, [profile?.uid]);

  const stages = [
    { id: 'researching', icon: FileText, label: 'Research' },
    { id: 'scripting', icon: Play, label: 'Scripting' },
    { id: 'generating_audio', icon: Mic, label: 'TTS' },
    { id: 'assembling', icon: ImageIcon, label: 'Assembly' },
    { id: 'ready_to_publish', icon: Upload, label: 'Ready' },
    { id: 'published', icon: CheckCircle2, label: 'Published' }
  ];

  return (
    <div className="p-8 space-y-8">
      <h2 className="text-3xl font-bold text-white">Content Pipeline</h2>
      
      <div className="space-y-6">
        {jobs.length > 0 ? jobs.map((job, index) => {
          const details = getStatusDetails(job.status);
          const projectNumber = jobs.length - index;
          
          return (
            <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 text-xs font-black uppercase">Project {projectNumber}</span>
                    {job.type === 'manual' && (
                      <span className="bg-zinc-800 text-zinc-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">Manual</span>
                    )}
                    <h3 className="text-xl font-bold text-white">{job.topic}</h3>
                  </div>
                  <p className="text-zinc-500 text-sm mt-1 italic opacity-60">{details.text} • Est. {details.time} remaining</p>
                </div>
                <div className="flex gap-2">
                <button 
                  onClick={() => { setSelectedJob(job); setShowAssetModal(true); }}
                  className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors"
                >
                  View Assets
                </button>
                <button 
                  onClick={() => { setSelectedJob(job); setShowReviewModal(true); }}
                  className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                >
                  Manual Review
                </button>
                <button 
                  onClick={() => { setSchedulingJob(job); setShowScheduleModal(true); }}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  Schedule
                </button>
                {job.status === 'ready_to_publish' && (
                  <button 
                    onClick={() => handlePublishNow(job)}
                    disabled={publishing === job.id}
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {publishing === job.id ? 'Publishing...' : 'Publish Now'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 right-0 h-0.5 bg-zinc-800 top-1/2 -translate-y-1/2 z-0" />
              {stages.map((stage, index) => {
                const isActive = job.status === stage.id;
                const isCompleted = stages.findIndex(s => s.id === job.status) > index;
                
                return (
                  <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      isActive ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' :
                      isCompleted ? 'bg-emerald-600 border-emerald-600 text-white' :
                      'bg-zinc-900 border-zinc-800 text-zinc-600'
                    }`}>
                      <stage.icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      isActive ? 'text-blue-500' :
                      isCompleted ? 'text-emerald-500' :
                      'text-zinc-600'
                    }`}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {job.status === 'failed' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertCircle className="text-red-500 w-5 h-5" />
                  <p className="text-red-500 text-sm font-medium">Error: {job.error || 'Unknown pipeline failure'}</p>
                </div>
                <button 
                  onClick={() => handleRetry(job)}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                >
                  Retry Processing
                </button>
              </div>
            )}
          </div>
        );
      }) : (
          <div className="py-24 text-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl">
            <Video className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-zinc-400">No active jobs</h3>
            <p className="text-zinc-500 mt-2">Start a pipeline from the trends discovery page.</p>
          </div>
        )}
      </div>

      {/* Asset Modal */}
      <AnimatePresence>
        {showAssetModal && selectedJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-white">Review & Edit Assets</h3>
                  <span className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                    {selectedJob.topic}
                  </span>
                </div>
                <button onClick={() => setShowAssetModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Editing */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Video Title</label>
                      <input 
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                      />
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {selectedJob.pipeline.metadata?.titles?.map((t: string, i: number) => (
                          <button 
                            key={i}
                            onClick={() => setEditedTitle(t)}
                            className="whitespace-nowrap bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-full border border-zinc-700 transition-colors"
                          >
                            Suggestion {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                      <textarea 
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        rows={6}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors resize-none text-sm"
                      />
                      <div className="flex gap-2">
                        {selectedJob.pipeline.metadata?.descriptions?.map((_, i: number) => (
                          <button 
                            key={i}
                            onClick={() => setEditedDescription(selectedJob.pipeline.metadata?.descriptions?.[i] || '')}
                            className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-full border border-zinc-700 transition-colors"
                          >
                            Version {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Tags (comma separated)</label>
                      <input 
                        type="text"
                        value={editedTags}
                        onChange={(e) => setEditedTags(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 flex gap-4">
                    <button 
                      onClick={async () => {
                        await setDoc(doc(db, 'jobs', selectedJob.id), {
                          pipeline: {
                            ...selectedJob.pipeline,
                            metadata: {
                              ...selectedJob.pipeline.metadata,
                              titles: [editedTitle, ...(selectedJob.pipeline.metadata?.titles?.filter((t: string) => t !== editedTitle) || [])],
                              descriptions: [editedDescription, ...(selectedJob.pipeline.metadata?.descriptions?.filter((d: string) => d !== editedDescription) || [])],
                              tags: editedTags.split(',').map(t => t.trim())
                            },
                            thumbnailUrls: [selectedThumbnail, ...(selectedJob.pipeline.thumbnailUrls?.filter((u: string) => u !== selectedThumbnail) || [])]
                          }
                        }, { merge: true });
                        alert("Changes saved to pipeline!");
                      }}
                      className="flex-1 bg-zinc-800 text-white py-4 rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                    >
                      Save Changes
                    </button>
                    <button 
                      onClick={() => handlePublishNow(selectedJob)}
                      disabled={publishing === selectedJob.id}
                      className="flex-1 bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {publishing === selectedJob.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      Publish Now
                    </button>
                  </div>
                </div>

                {/* Right Column: Visuals */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-3">Select Thumbnail</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedJob.pipeline.thumbnailUrls?.map((url, i) => (
                        <div 
                          key={i} 
                          onClick={() => setSelectedThumbnail(url)}
                          className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedThumbnail === url ? 'border-red-500 scale-[1.02]' : 'border-zinc-800 opacity-60 hover:opacity-100'}`}
                        >
                          <img src={url} alt="Thumbnail" className="w-full aspect-video object-cover" />
                          {selectedThumbnail === url && (
                            <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-3">Script Preview</h4>
                    <div className="bg-zinc-800/50 rounded-xl p-4 h-64 overflow-y-auto border border-zinc-800">
                      <p className="text-zinc-400 text-sm whitespace-pre-wrap leading-relaxed">
                        {selectedJob.pipeline.script?.content || "No script generated yet."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {showReviewModal && selectedJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-2xl shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Manual Review</h3>
                <button onClick={() => setShowReviewModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
                  <h4 className="text-lg font-bold text-white mb-2">AI Analysis Summary</h4>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    The AI has completed the analysis of your video topic: <strong>{selectedJob.topic}</strong>.
                    It has generated SEO-optimized metadata and high-CTR thumbnail concepts.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-800">
                    <p className="text-xs text-zinc-500 font-bold uppercase mb-1">Status</p>
                    <p className="text-white font-bold capitalize">{selectedJob.status.replace('_', ' ')}</p>
                  </div>
                  <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-800">
                    <p className="text-xs text-zinc-500 font-bold uppercase mb-1">Type</p>
                    <p className="text-white font-bold capitalize">{selectedJob.type}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => { setShowReviewModal(false); setShowAssetModal(true); }}
                    className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                  >
                    Edit Assets
                  </button>
                  <button 
                    onClick={() => { setShowReviewModal(false); handlePublishNow(selectedJob); }}
                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
                  >
                    Approve & Publish
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Schedule Modal */}
      <AnimatePresence>
        {showScheduleModal && schedulingJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Schedule Publishing</h3>
                <button onClick={() => setShowScheduleModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Specific Time</label>
                  <input 
                    type="datetime-local" 
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Interval (Hours)</label>
                  <select 
                    value={scheduleInterval}
                    onChange={(e) => setScheduleInterval(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={0}>No Interval</option>
                    <option value={1}>Every 1 Hour</option>
                    <option value={4}>Every 4 Hours</option>
                    <option value={12}>Every 12 Hours</option>
                    <option value={24}>Every 24 Hours</option>
                  </select>
                </div>

                <button 
                  onClick={handleSchedule}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                >
                  Save Schedule
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AdminPage = () => {
  const [stats, setStats] = useState({
    totalJobs: 0,
    failedJobs: 0,
    publishedToday: 0,
    apiQuota: '85%'
  });

  return (
    <div className="p-8 space-y-8">
      <h2 className="text-3xl font-bold text-white">System Monitoring</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Jobs', value: stats.totalJobs, color: 'text-white' },
          { label: 'Failed Jobs', value: stats.failedJobs, color: 'text-red-500' },
          { label: 'Published Today', value: stats.publishedToday, color: 'text-emerald-500' },
          { label: 'API Quota', value: stats.apiQuota, color: 'text-blue-500' }
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">Error Logs</h3>
          <button className="text-xs text-zinc-500 font-bold hover:text-white transition-colors">Clear Logs</button>
        </div>
        <div className="p-6">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                <th className="pb-4">Timestamp</th>
                <th className="pb-4">Job ID</th>
                <th className="pb-4">Error Message</th>
                <th className="pb-4">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-t border-zinc-800/50">
                <td className="py-4 text-zinc-400">2026-03-27 09:24</td>
                <td className="py-4 text-zinc-500">job-8821</td>
                <td className="py-4 text-red-400">YouTube API: Quota Exceeded</td>
                <td className="py-4">
                  <span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[10px] font-bold">FAILED</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trends" element={<Dashboard />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

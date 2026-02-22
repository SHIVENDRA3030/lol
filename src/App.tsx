import React, { useState, useEffect, useRef } from 'react'
import { Send, Loader2, Bot, User, Copy, Check } from 'lucide-react'
import { supabase } from './lib/supabase'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './index.css'

// Types
type Role = 'user' | 'assistant' | 'system';
interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  created_at?: string;
}

// Use a universal session ID for global, public chat syncing
const getSessionId = () => {
  // Supabase expects a valid UUID for the column, so we use the zero-UUID
  return '00000000-0000-0000-0000-000000000000';
};

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChatGptView, setIsChatGptView] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const sessionId = getSessionId();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const fetchChats = async () => {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching chats:', error);
    } else if (data) {
      setMessages(data);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsgContent = input.trim();
    setInput('');
    setIsLoading(true);

    // Optimistic UI update for user message
    const tempUserId = crypto.randomUUID();
    const newUserMsg: ChatMessage = { id: tempUserId, role: 'user', content: userMsgContent };
    setMessages(prev => [...prev, newUserMsg]);

    try {
      // 1. Save user message to Supabase
      await supabase.from('chats').insert({
        session_id: sessionId,
        role: 'user',
        content: userMsgContent
      });

      // 2. Prepare conversation history for Nvidia API
      const apiMessages = [
        { role: 'system', content: 'You are a helpful, concise AI assistant.' },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsgContent }
      ];

      // 3. Call Nvidia API via Vite Proxy
      const response = await fetch('/api/nvidia/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-70b-instruct',
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1024,
        })
      });

      if (!response.ok) {
        throw new Error(`Nvidia API error: ${response.status} ${response.statusText}`);
      }

      const resData = await response.json();
      const assistantMsgContent = resData.choices[0]?.message?.content || 'Sorry, I couldn\'t formulate a response.';

      // 4. Save assistant response to Supabase
      const { data: savedAssistantMsg, error: supabaseError } = await supabase.from('chats').insert({
        session_id: sessionId,
        role: 'assistant',
        content: assistantMsgContent
      }).select().single();

      if (supabaseError) {
        console.warn("Failed to insert assistant message:", supabaseError);
      }

      // 5. Update UI
      if (savedAssistantMsg) {
        setMessages(prev => [...prev, savedAssistantMsg as ChatMessage]);
      } else {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: assistantMsgContent }]);
      }

    } catch (error: any) {
      console.error('Error in chat flow:', error);
      let errMsg = error.message || 'An error occurred while processing your request.';
      if (errMsg === 'Failed to fetch') {
        errMsg = 'Failed to connect to the API. This might be a CORS issue or network offline.';
      }
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${errMsg}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-white text-slate-900 font-sans">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-6 z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Bot size={20} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">AI Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsChatGptView((prev) => !prev)}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {isChatGptView ? 'Back to AI Chat' : 'Chat with ChatGPT'}
          </button>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse"></div>
            <span className="text-xs font-medium text-slate-600">Systems Normal</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className={`flex-1 px-4 md:px-6 lg:px-8 py-6 flex flex-col gap-6 bg-slate-50/50 ${isChatGptView ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
      >
        {isChatGptView ? (
          <div className="flex h-full w-full flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              <p>ChatGPT may block iframe embedding. Use the new-tab button if it does not load here.</p>
              <a
                href="https://chatgpt.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Open in new tab
              </a>
            </div>
            <iframe
              title="ChatGPT"
              src="https://chatgpt.com/"
              className="h-full min-h-0 w-full flex-1 rounded-xl border border-slate-200 bg-white"
            />
          </div>
        ) : (
          <>
            {messages.length === 0 && !isLoading && (
              <div className="flex h-full flex-col items-center justify-center text-center opacity-70 mt-20">
                <Bot size={48} className="mb-4 text-emerald-600/50" />
                <p className="text-lg font-medium text-slate-700">How can I help you today?</p>
                <p className="text-sm text-slate-500 max-w-sm mt-2">
                  This is a global, public chat room. All users share this conversational history.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] md:max-w-[75%] gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`shrink-0 flex size-8 items-center justify-center rounded-full mt-1
                    ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}
                  >
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className="flex flex-col gap-1 w-full overflow-x-hidden">
                    <div
                      className={`rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm
                        ${msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-sm'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
                        }`}
                    >
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div className="prose prose-sm prose-slate max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              pre: ({ node, children, ...props }: any) => {
                                let codeString = '';
                                if (children && children.props && children.props.children) {
                                  codeString = String(children.props.children).replace(/\n$/, '');
                                }
                                const idStr = `code-${msg.id}-${codeString.substring(0, 10)}`;
                                const isCopied = copiedId === idStr;

                                return (
                                  <div className="relative group my-4">
                                    <button
                                      onClick={() => copyToClipboard(codeString, idStr)}
                                      className="absolute right-2 top-2 p-1.5 rounded-md bg-slate-700/50 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-700 hover:text-white z-10"
                                      title="Copy code"
                                    >
                                      {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                    </button>
                                    <pre {...props} className="!my-0">
                                      {children}
                                    </pre>
                                  </div>
                                );
                              }
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="flex justify-start px-2 mt-0.5">
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check size={14} className="text-emerald-500" />
                              <span className="text-emerald-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex w-full justify-start">
                <div className="flex gap-4">
                  <div className="shrink-0 flex size-8 items-center justify-center rounded-full mt-1 bg-emerald-100 text-emerald-600">
                    <Bot size={16} />
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-200 rounded-tl-sm px-5 py-4 flex items-center gap-2 shadow-sm">
                    <div className="size-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="size-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="size-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </main>

      {!isChatGptView && (
        <footer className="shrink-0 p-4 md:p-6 bg-white border-t border-slate-100">
          <form onSubmit={handleSend} className="relative flex w-full h-full max-w-4xl mx-auto items-end gap-2 group">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message AI Chat..."
                disabled={isLoading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 pr-14 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:bg-slate-50 disabled:cursor-not-allowed shadow-sm"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2.5 top-2.5 flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 transition-all shadow-sm"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="mr-0.5 mt-0.5" />}
              </button>
            </div>
          </form>
          <div className="text-center mt-3 text-xs font-medium text-slate-400">
            AI can make mistakes. Verify important information.
          </div>
        </footer>
      )}
    </div>
  )
}

export default App

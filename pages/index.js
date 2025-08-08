// Fayl: pages/index.js

import { useState, useEffect, useRef } from "react";

// UUID generatsiya qilish uchun yordamchi funksiya (agar backend’da userId generatsiya qilinmasa)
const generateUserId = () => {
  return "user_" + Math.random().toString(36).substr(2, 9);
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [userId, setUserId] = useState(() => {
    if (typeof window !== "undefined") {
      let storedId = localStorage.getItem("anime_ai_userId");
      if (!storedId) {
        storedId = generateUserId();
        localStorage.setItem("anime_ai_userId", storedId);
      }
      return storedId;
    }
    return null;
  });
  const [topics, setTopics] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = JSON.parse(localStorage.getItem("anime_ai_topics")) || [];
      return stored.filter(
        (topic) => topic.prompt?.trim() && topic.messages?.length > 0
      );
    }
    return [];
  });
  const [currentTopic, setCurrentTopic] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const messageEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("anime_ai_topics", JSON.stringify(topics));
  }, [topics]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async () => {
    if (!prompt.trim() || !userId) return;
    setIsLoading(true);
    setIsTyping(true);
    setIsStopped(false);

    setMessages((prev) =>
      prev.map((msg) => (msg.role === "ai" ? { ...msg, isNew: false } : msg))
    );

    const formattedPrompt = formatMessage(prompt);
    const userMessage = { role: "user", content: formattedPrompt, isNew: true };
    setMessages((prev) => [...prev, userMessage]);

    const newTopic = {
      prompt: prompt.trim(),
      messages: [...messages, userMessage],
    };
    setTopics((prev) => {
      const updatedTopics = currentTopic
        ? prev.map((topic) =>
            topic.prompt === currentTopic.prompt ? newTopic : topic
          )
        : [newTopic, ...prev];
      return updatedTopics.filter(
        (topic) => topic.prompt?.trim() && topic.messages?.length > 0
      );
    });
    setCurrentTopic(newTopic);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, userId }), // userId qo'shildi
      });

      const data = await response.json();

      if (response.ok) {
        const formattedResponse = formatMessage(data.response);
        const aiResponse = { role: "ai", content: formattedResponse, isNew: true };
        setMessages((prev) => [...prev, aiResponse]);
        setTopics((prev) =>
          prev.map((topic) =>
            topic.prompt === newTopic.prompt
              ? { ...topic, messages: [...topic.messages, aiResponse] }
              : topic
          )
        );
      } else {
        const errorResponse = {
          role: "ai",
          content: formatMessage(
            `Kechirasiz, xatolik yuz berdi: ${data.error || "Noma'lum xato"}`
          ),
          isNew: true,
        };
        setMessages((prev) => [...prev, errorResponse]);
        setTopics((prev) =>
          prev.map((topic) =>
            currentTopic && topic.prompt === currentTopic.prompt
              ? { ...topic, messages: [...topic.messages, errorResponse] }
              : topic
          )
        );
        
      }
    } catch (error) {
      const errorResponse = {
        role: "ai",
        content: formatMessage(
          "Kechirasiz, tarmoq xatosi yuz berdi. Iltimos, qayta urinib ko'ring."
        ),
        isNew: true,
      };
      setMessages((prev) => [...prev, errorResponse]);
      setTopics((prev) =>
        prev.map((topic) =>
          currentTopic && topic.prompt === currentTopic.prompt
            ? { ...topic, messages: [...topic.messages, errorResponse] }
            : topic
        )
      );
      
    } finally {
      setIsLoading(false);
      if (isStopped) setIsTyping(false);
    }
  };

  const handleStop = () => {
    setIsStopped(true);
    setIsTyping(false);
    setPrompt("");
  };

  const handleTopicSelect = (topic) => {
    const loadedMessages = topic.messages.map((msg) => ({
      ...msg,
      isNew: false,
      content: Array.isArray(msg.content) ? msg.content : formatMessage(msg.content),
    }));
    setMessages(loadedMessages);
    setCurrentTopic({ ...topic, messages: loadedMessages });
    setPrompt("");
    setShowMenu(false);
    setIsStopped(false);
    setIsTyping(false);
  };

  const handleNewTopic = () => {
    setMessages([]);
    setCurrentTopic(null);
    setPrompt("");
    setShowMenu(false);
    setIsStopped(false);
    setIsTyping(false);
  };

  const formatMessage = (text) => {
    const lines = text.split("\n").filter((line) => line.trim());
    let formatted = [];
    let currentList = null;

    lines.forEach((line) => {
      line = line.trim();
      if (line.startsWith("- ") || line.startsWith("* ")) {
        if (!currentList) {
          currentList = { type: "list", items: [] };
          formatted.push(currentList);
        }
        currentList.items.push(line.slice(2).trim());
      } else {
        if (currentList) {
          currentList = null;
        }
        if (line.startsWith("# ")) {
          formatted.push({ type: "heading", content: line.slice(2).trim() });
        } else if (line) {
          formatted.push({ type: "paragraph", content: line });
        }
      }
    });

    return formatted.length ? formatted : [{ type: "paragraph", content: text.trim() }];
  };

  const renderStaticMarkdown = (elements) => {
    let html = "";
    elements.forEach((element) => {
      if (element.type === "paragraph" && element.content) {
        html += `<p class="inline-block">${element.content}</p>`;
      } else if (element.type === "heading" && element.content) {
        html += `<h3 class="font-bold mt-2 inline-block">${element.content}</h3>`;
      } else if (element.type === "list" && element.items.length) {
        html += `<ul class="list-disc pl-6">${element.items
          .map((item) => (item ? `<li class="inline-block">${item}</li>` : ""))
          .join("")}</ul>`;
      }
    });
    return html;
  };

  const TypingAnimation = ({ elements, onComplete, isStopped, setPartialText }) => {
    const [currentElementIndex, setCurrentElementIndex] = useState(0);
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [displayedElements, setDisplayedElements] = useState([]);

    useEffect(() => {
      if (isStopped) {
        const partialText = displayedElements.map((el) => ({ ...el }));
        setPartialText(partialText);
        return;
      }

      if (currentElementIndex < elements.length) {
        const element = elements[currentElementIndex];
        if (element.type === "list") {
          if (currentItemIndex < element.items.length) {
            const item = element.items[currentItemIndex];
            const words = item.split(" ").filter((word) => word);
            if (currentWordIndex < words.length) {
              const timeout = setTimeout(() => {
                setCurrentWordIndex((prev) => prev + 1);
              }, 100);
              return () => clearTimeout(timeout);
            } else {
              setDisplayedElements((prev) => {
                const newList =
                  prev.find((el) => el.type === "list" && el !== prev[prev.length - 1])
                    ? prev[prev.length - 1]
                    : { type: "list", items: [] };
                newList.items = [
                  ...newList.items.slice(0, currentItemIndex),
                  item,
                  ...newList.items.slice(currentItemIndex + 1),
                ];
                return [...prev.slice(0, -1), newList];
              });
              setCurrentWordIndex(0);
              setCurrentItemIndex((prev) => prev + 1);
            }
          } else {
            setCurrentItemIndex(0);
            setCurrentWordIndex(0);
            setCurrentElementIndex((prev) => prev + 1);
          }
        } else {
          const text = element.content || "";
          const words = text.split(" ").filter((word) => word);
          if (currentWordIndex < words.length) {
            const timeout = setTimeout(() => {
              setCurrentWordIndex((prev) => prev + 1);
            }, 100);
            return () => clearTimeout(timeout);
          } else {
            setDisplayedElements((prev) => [
              ...prev,
              { ...element, content: text },
            ]);
            setCurrentWordIndex(0);
            setCurrentElementIndex((prev) => prev + 1);
          }
        }
      } else {
        setPartialText(elements);
        onComplete();
      }
    }, [currentWordIndex, currentItemIndex, currentElementIndex, elements, isStopped]);

    return (
      <div className="markdown-content">
        {displayedElements.map((element, index) => {
          if (element.type === "paragraph") {
            return (
              <p key={index} className="inline-block">
                {element.content.split(" ").map((word, i) => (
                  <span
                    key={i}
                    className="animate-slide-in"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {word + " "}
                  </span>
                ))}
              </p>
            );
          } else if (element.type === "heading") {
            return (
              <h3 key={index} className="font-bold mt-2 inline-block">
                {element.content.split(" ").map((word, i) => (
                  <span
                    key={i}
                    className="animate-slide-in"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {word + " "}
                  </span>
                ))}
              </h3>
            );
          } else if (element.type === "list") {
            return (
              <ul key={index} className="list-disc pl-6">
                {element.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="inline-block">
                    {item.split(" ").map((word, i) => (
                      <span
                        key={i}
                        className="animate-slide-in"
                        style={{ animationDelay: `${i * 0.1}s` }}
                      >
                        {word + " "}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            );
          }
          return null;
        })}
        {currentElementIndex < elements.length && (
          <>
            {elements[currentElementIndex].type === "paragraph" && (
              <p className="inline-block">
                {elements[currentElementIndex].content
                  .split(" ")
                  .slice(0, currentWordIndex)
                  .map((word, i) => (
                    <span
                      key={i}
                      className="animate-slide-in"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    >
                      {word + " "}
                    </span>
                  ))}
              </p>
            )}
            {elements[currentElementIndex].type === "heading" && (
              <h3 className="font-bold mt-2 inline-block">
                {elements[currentElementIndex].content
                  .split(" ")
                  .slice(0, currentWordIndex)
                  .map((word, i) => (
                    <span
                      key={i}
                      className="animate-slide-in"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    >
                      {word + " "}
                    </span>
                  ))}
              </h3>
            )}
            {elements[currentElementIndex].type === "list" &&
              currentItemIndex < elements[currentElementIndex].items.length && (
                <ul className="list-disc pl-6">
                  <li className="inline-block">
                    {elements[currentElementIndex].items[currentItemIndex]
                      .split(" ")
                      .slice(0, currentWordIndex)
                      .map((word, i) => (
                        <span
                          key={i}
                          className="animate-slide-in"
                          style={{ animationDelay: `${i * 0.1}s` }}
                        >
                          {word + " "}
                        </span>
                      ))}
                  </li>
                </ul>
              )}
          </>
        )}
      </div>
    );
  };

  const markMessageAsRead = (index) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, isNew: false } : m
      )
    );
    setTopics((prev) =>
      prev.map((topic) =>
        topic.prompt === currentTopic?.prompt
          ? { ...topic, messages }
          : topic
      )
    );
    setIsTyping(false);
    setPrompt("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1f1c2c] via-[#928DAB] to-[#1f1c2c] text-white">
      <style jsx>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-slide-in {
          opacity: 0;
          animation: slideInLeft 0.3s ease-out forwards;
        }

        .ai-message {
          animation: slideInLeft 0.3s ease-out;
        }

        .loader {
          width: 80px;
          height: 80px;
          background: linear-gradient(
            165deg,
            rgba(255, 255, 255, 1) 0%,
            rgb(255, 200, 200) 30%,
            rgb(255, 100, 100) 70%,
            rgb(50, 50, 50) 100%
          );
          border-radius: 50%;
          position: relative;
          margin: 20px auto;
          box-shadow: 0 0 15px rgba(255, 100, 100, 0.5);
        }

        .loader:before {
          content: "";
          width: 100%;
          height: 100%;
          border-radius: 100%;
          border-bottom: 0 solid rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 -8px 15px 15px rgba(255, 100, 100, 0.3) inset,
            0 -4px 10px 8px rgba(255, 100, 100, 0.4) inset,
            0 -2px 4px rgba(255, 100, 100, 0.6) inset,
            0 2px 0px #ffffff,
            0 2px 3px #ffffff,
            0 4px 4px rgba(255, 255, 255, 0.7),
            0 8px 12px rgba(255, 255, 255, 0.5);
          filter: blur(2px);
          animation: 1.5s rotate linear infinite;
        }

        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }

        .fixed-input {
          position: fixed;
          bottom: 20px;
          left: 0;
          right: 0;
          max-width: 768px;
          margin: 0 auto;
          padding: 0 16px;
          z-index: 50;
        }

        .markdown-content ul {
          list-style-type: disc;
          padding-left: 24px;
          margin: 8px 0;
        }

        .markdown-content li {
          margin-bottom: 4px;
          display: inline-block;
        }

        .markdown-content p {
          margin: 8px 0;
          display: inline-block;
        }

        .markdown-content h3 {
          margin: 8px 0;
          display: inline-block;
        }

        .message-container {
          max-width: 90%;
          margin-bottom: 16px;
          padding: 12px 16px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .hamburger-menu {
          transition: all 0.3s ease;
        }

        .hamburger-menu.open span:nth-child(1) {
          transform: translateY(8px) rotate(45deg);
        }

        .hamburger-menu.open span:nth-child(2) {
          opacity: 0;
        }

        .hamburger-menu.open span:nth-child(3) {
          transform: translateY(-8px) rotate(-45deg);
        }
      `}</style>

      <header className="fixed top-0 left-0 w-full bg-black/90 z-50 shadow-lg flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold">🎌 Anime AI</h1>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 space-y-1.5 hamburger-menu"
        >
          <span className={`w-6 h-0.5 bg-white ${showMenu ? 'open' : ''}`}>
            <span className="block w-full h-full bg-white"></span>
            <span className="block w-full h-full bg-white"></span>
            <span className="block w-full h-full bg-white"></span>
          </span>
        </button>
      </header>

      {showMenu && (
        <div className="fixed inset-0 bg-black/95 z-40 flex flex-col p-6 overflow-y-auto animate-slide-in">
          <button
            onClick={() => setShowMenu(false)}
            className="self-end text-white text-2xl mb-4"
          >
            ✕
          </button>
          <h2 className="text-xl font-semibold mb-4">Mavzular:</h2>
          <button
            onClick={handleNewTopic}
            className="bg-pink-600 hover:bg-pink-700 text-white p-3 rounded-lg mb-4 transition-colors"
          >
            Yangi Mavzu
          </button>
          <ul className="space-y-2">
            {topics.map((topic, index) => (
              <li
                key={index}
                onClick={() => handleTopicSelect(topic)}
                className="bg-white/10 p-3 rounded-lg cursor-pointer hover:bg-white/20 transition-colors"
              >
                {topic.prompt}
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="pt-17   md:px-8 max-w-4xl mx-auto ">
        <div className="h-[100%]  bg-white/10 backdrop-blur-lg shadow-xl rounded-2xl border pr-3  pb-20 border-white/20">
          {messages.length === 0 ? (
            <p className="text-center text-gray-300 mt-4"><b>Anime AI 😊 Savol Yozing!</b></p>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`message-container ${msg.role === "user" ? "ml-10 border-1  user-message" : " ml-2 border border-white/100 !shadow-none font-bold  text-black mr-auto ai-message"}`}
              >
                {msg.role === "ai" && msg.isNew && !isStopped ? (
                  <TypingAnimation
                    elements={msg.content}
                    onComplete={() => markMessageAsRead(index)}
                    isStopped={isStopped}
                    setPartialText={(partial) =>
                      setMessages((prev) =>
                        prev.map((m, i) =>
                          i === index ? { ...m, content: partial, isNew: false } : m
                        )
                      )
                    }
                  />
                ) : (
                  <span
                    className="markdown-content"
                    dangerouslySetInnerHTML={{ __html: renderStaticMarkdown(msg.content) }}
                  />
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="text-center">
              <span className="loader"></span>

            </div>
          )}
          <div ref={messageEndRef} />
          
                  </div>

        <div className="fixed-input">
          <div className="relative w-full">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isLoading && !isTyping) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Nma Haqida Bilmoqchsiz?"
              className="w-full bg-gradient-to-r from-[#a7a3c0] text-white placeholder-gray-300 rounded-xl px-4 pr-14 py-3 border border-white/30 focus:outline-none focus:ring-2 transition-all"
              style={{
                height: "56px",
                fontSize: "16px",
              }}
              disabled={isLoading || isTyping}
            />
            <button
              onClick={isTyping ? handleStop : handleSubmit}
              disabled={(!isTyping && !prompt.trim()) || isLoading}
              className={`absolute right-2 top-1/2 transform -translate-y-1/2 rounded-lg w-10 h-10 flex items-center justify-center shadow-md ${
                isTyping
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-pink-600 hover:bg-pink-700"
              } text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            >
              {isTyping ? "■" : "➤"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
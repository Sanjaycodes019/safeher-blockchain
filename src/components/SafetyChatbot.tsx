import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Send, Shield, MapPin, MessageCircle } from "lucide-react";

interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
}

interface Location {
  lat: number;
  lon: number;
}

type ChatMode = 'emergency' | 'advice';

const SafetyChatbot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>('emergency');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Categories mapping for different user queries
  const categoryMapping: { [key: string]: string } = {
    'hospital': 'healthcare.hospital',
    'police': 'service.police',
    'police station': 'service.police',
    'ambulance': 'service.ambulance_station',
    'fire station': 'service.fire_station',
    'shelter': 'service.social_facility.shelter',
    'pharmacy': 'healthcare.pharmacy',
    'toilet': 'amenity.toilet',
    'water': 'amenity.drinking_water',
    'drinking water': 'amenity.drinking_water'
  };

  useEffect(() => {
    // Get user location when component mounts
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        // Initial greeting
        setMessages([{
          sender: 'bot',
          text: "Hello! I'm here to help. Choose a mode:\n📍 Emergency Services - Find nearby help\n💭 Ask for Advice - Get safety guidance",
          timestamp: Date.now()
        }]);
      },
      (error) => {
        toast.error("Location access denied. Some features may be limited.");
        setMessages([{
          sender: 'bot',
          text: "Hello! I'm here to help. Note: Location access is needed for finding emergency services.",
          timestamp: Date.now()
        }]);
      }
    );
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchAIAdvice = async (question: string) => {
    const apiKey = import.meta.env.VITE_OPENROUTER_KEY;
    if (!apiKey) {
      return "I'm sorry, but I can't provide advice right now due to a configuration issue. Please try the emergency services mode or contact emergency services directly if you need immediate help.";
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "SafeHer Safety Assistant"
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-opus",
          messages: [
            {
              role: "system",
              content: "You are a safety advisor. Provide brief, practical advice. Keep responses under 100 words."
            },
            {
              role: "user",
              content: question
            }
          ],
          temperature: 0.7,
          max_tokens: 150
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenRouter API error:', errorData);
        
        if (errorData.error?.code === 402) {
          return getFallbackResponse(question);
        }
        
        throw new Error(errorData.error?.message || 'Failed to get AI response');
      }

      const data = await response.json();
      
      if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        return getFallbackResponse(question);
      }

      const choice = data.choices[0];
      if (!choice || !choice.message || !choice.message.content) {
        return getFallbackResponse(question);
      }

      return choice.message.content;
    } catch (error) {
      console.error('Error getting AI advice:', error);
      return getFallbackResponse(question);
    }
  };

  const getFallbackResponse = (question: string) => {
    const lowerQuestion = question.toLowerCase();
    
    const safetyResponses: { [key: string]: string } = {
      'walking': "When walking alone:\n1. Stay in well-lit areas\n2. Keep your phone charged\n3. Share your location with trusted contacts\n4. Be aware of your surroundings",
      'night': "For night safety:\n1. Use well-lit routes\n2. Stay in populated areas\n3. Have emergency contacts ready\n4. Consider using a ride-sharing service",
      'emergency': "In an emergency:\n1. Call emergency services (911)\n2. Use the SOS button in the app\n3. Share your location with trusted contacts\n4. Stay calm and follow instructions",
      'travel': "When traveling:\n1. Share your itinerary with trusted contacts\n2. Keep important documents secure\n3. Have emergency numbers saved\n4. Use the app's location sharing feature",
      'public': "In public places:\n1. Stay aware of your surroundings\n2. Keep valuables secure\n3. Have an exit plan\n4. Trust your instincts if something feels wrong"
    };

    for (const [keyword, response] of Object.entries(safetyResponses)) {
      if (lowerQuestion.includes(keyword)) {
        return response;
      }
    }

    return "For your safety:\n1. Stay alert and aware of your surroundings\n2. Keep your phone charged and accessible\n3. Have emergency contacts ready\n4. Trust your instincts\n5. Use the SOS button if you feel unsafe\n\nFor immediate help, switch to Emergency Services mode or call emergency services.";
  };

  const findNearbyPlaces = async (category: string) => {
    if (!userLocation) {
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: "I need your location to find nearby places. Please enable location services.",
        timestamp: Date.now()
      }]);
      return;
    }

    const apiKey = import.meta.env.VITE_GEOAPIFY_KEY;
    if (!apiKey) {
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: "Sorry, I can't search for places right now. The service is not properly configured.",
        timestamp: Date.now()
      }]);
      return;
    }

    try {
      // First try with 5km radius
      const url = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${userLocation.lon},${userLocation.lat},5000&bias=proximity:${userLocation.lon},${userLocation.lat}&limit=5&apiKey=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error('Failed to fetch places');
      }

      if (!data.features || data.features.length === 0) {
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: "I couldn't find any places of that type nearby. Let me search in a wider area...",
          timestamp: Date.now()
        }]);

        // Try with 10km radius
        const widerUrl = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${userLocation.lon},${userLocation.lat},10000&bias=proximity:${userLocation.lon},${userLocation.lat}&limit=5&apiKey=${apiKey}`;
        const widerResponse = await fetch(widerUrl);
        const widerData = await widerResponse.json();

        if (!widerData.features || widerData.features.length === 0) {
          setMessages(prev => [...prev, {
            sender: 'bot',
            text: "Still searching in an even wider area...",
            timestamp: Date.now()
          }]);

          // Try with 50km radius as a last resort
          const widestUrl = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${userLocation.lon},${userLocation.lat},50000&bias=proximity:${userLocation.lon},${userLocation.lat}&limit=10&apiKey=${apiKey}`;
          const widestResponse = await fetch(widestUrl);
          const widestData = await widestResponse.json();

          if (!widestData.features || widestData.features.length === 0) {
            setMessages(prev => [...prev, {
              sender: 'bot',
              text: "I'm sorry, I couldn't find any locations of that type even within 50km radius.",
              timestamp: Date.now()
            }]);
            return;
          }

          return formatAndDisplayResults(widestData.features, category, 50);
        }

        return formatAndDisplayResults(widerData.features, category, 10);
      }

      formatAndDisplayResults(data.features, category, 5);
    } catch (error) {
      console.error('Error fetching places:', error);
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: "Sorry, I encountered an error while searching for places. Please try again.",
        timestamp: Date.now()
      }]);
    }
  };

  const formatAndDisplayResults = (places: any[], category: string, searchRadius: number) => {
    const categoryIcons: { [key: string]: string } = {
      'healthcare.hospital': '🏥',
      'service.police': '👮',
      'service.ambulance_station': '🚑',
      'service.fire_station': '🚒',
      'service.social_facility.shelter': '🏠',
      'healthcare.pharmacy': '💊',
      'amenity.toilet': '🚻',
      'amenity.drinking_water': '💧'
    };

    const icon = categoryIcons[category] || '📍';
    const formattedPlaces = places.map(place => {
      const props = place.properties;
      const distance = Math.round(props.distance);
      const address = props.formatted || props.address_line2 || props.street;
      
      const distanceText = distance > 1000 
        ? `${(distance / 1000).toFixed(1)}km` 
        : `${distance}m`;
      
      return `${icon} ${props.name || 'Unnamed location'}\n📍 ${address}\n📞 ${props.phone || 'No phone available'}\n🚶‍♀️ ${distanceText} away`;
    }).join('\n\n');

    const categoryName = category.split('.').pop()?.replace(/_/g, ' ') || 'places';
    
    setMessages(prev => [...prev, {
      sender: 'bot',
      text: `I found these ${categoryName} locations within ${searchRadius}km radius:\n\n${formattedPlaces}`,
      timestamp: Date.now()
    }]);
  };

  const handleUserMessage = async (message: string) => {
    if (!message.trim()) return;

    setMessages(prev => [...prev, {
      sender: 'user',
      text: message,
      timestamp: Date.now()
    }]);

    setIsLoading(true);
    setInput('');

    if (chatMode === 'emergency') {
      const lowerMessage = message.toLowerCase();
      let categoryToSearch: string | null = null;

      for (const [keyword, category] of Object.entries(categoryMapping)) {
        if (lowerMessage.includes(keyword)) {
          categoryToSearch = category;
          break;
        }
      }

      if (categoryToSearch) {
        await findNearbyPlaces(categoryToSearch);
      } else {
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: "I can help you find nearby:\n- Hospitals\n- Police stations\n- Fire stations\n- Shelters\n- Pharmacies\n- Public toilets\n- Drinking water\n\nJust ask 'Where is the nearest [place]?'",
          timestamp: Date.now()
        }]);
      }
    } else {
      const advice = await fetchAIAdvice(message);
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: advice,
        timestamp: Date.now()
      }]);
    }

    setIsLoading(false);
  };

  const switchMode = (mode: ChatMode) => {
    setChatMode(mode);
    setMessages(prev => [...prev, {
      sender: 'bot',
      text: mode === 'emergency' 
        ? "Emergency Services mode activated. You can ask me to find nearby hospitals, police stations, shelters, and more."
        : "Advice mode activated. Feel free to ask any safety-related questions, and I'll provide guidance and support.",
      timestamp: Date.now()
    }]);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-safety-purple" />
          Safety Assistant
        </CardTitle>
        <div className="flex gap-2 mt-2">
          <Button
            onClick={() => switchMode('emergency')}
            className={`flex-1 ${
              chatMode === 'emergency' 
                ? 'bg-safety-purple text-white' 
                : 'bg-black text-white hover:bg-gray-800'
            }`}
          >
            <MapPin className="w-4 h-4 mr-2" />
            Emergency Services
          </Button>
          <Button
            onClick={() => switchMode('advice')}
            className={`flex-1 ${
              chatMode === 'advice' 
                ? 'bg-safety-purple text-white' 
                : 'bg-black text-white hover:bg-gray-800'
            }`}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Ask for Advice
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-y-auto mb-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.sender === 'user'
                    ? 'bg-safety-purple text-white'
                    : 'bg-gray-100'
                }`}
              >
                {msg.text.split('\n').map((line, j) => (
                  <p key={j} className="mb-1">{line}</p>
                ))}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={chatMode === 'emergency' 
              ? "Ask about nearby emergency services..." 
              : "Ask for safety advice..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUserMessage(input)}
            className="flex-1"
          />
          <Button
            onClick={() => handleUserMessage(input)}
            disabled={isLoading}
            className="bg-safety-purple hover:bg-safety-purple-dark text-white"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SafetyChatbot; 
import os
from google import genai
from google.genai.errors import APIError
from dotenv import load_dotenv

load_dotenv()

class GeminiAIService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = 'gemini-2.0-flash'  # or 'gemini-2.5-flash' when available
    
    def analyze_symptoms(self, symptoms_text):
        try:
            print("✅ Gemini Client initialized successfully.")

            # Medical-focused prompt
            prompt = f"""
            Act as a compassionate and professional AI medical assistant. Analyze the following symptoms and provide helpful information.

            PATIENT SYMPTOMS: {symptoms_text}

            Please provide a structured response with these sections:

            ## Possible Common Conditions
            - List 3-5 possible conditions that could explain these symptoms
            - Emphasize these are POSSIBILITIES, not diagnoses

            ## Self-Care Recommendations
            - Suggest 3-5 general self-care measures
            - Include home remedies and lifestyle adjustments

            ## When to Seek Medical Help
            - List specific red flags that require immediate attention
            - Mention when to consult a doctor

            ## Questions for Your Doctor
            - Suggest 3-5 questions the patient should ask their healthcare provider

            IMPORTANT DISCLAIMERS:
            - This is for informational purposes only
            - Not a substitute for professional medical advice
            - Always consult with a qualified healthcare provider
            - In emergencies, seek immediate medical attention

            Format the response in clear, easy-to-read markdown.
            """

            print(f"Sending symptoms to {self.model_name}...")
            
            response = self.client.models.generate_content(
                model=self.model_name, 
                contents=prompt
            )

            return {
                'success': True,
                'analysis': response.text,
                'model_used': self.model_name
            }

        except APIError as e:
            print(f"❌ Gemini API Error: {e}")
            return {
                'success': False,
                'error': f"API Error: {e}",
                'analysis': "Sorry, I'm having trouble connecting to the medical analysis service. Please try again later."
            }

        except Exception as e:
            print(f"❌ An unexpected error occurred: {e}")
            return {
                'success': False,
                'error': f"Unexpected error: {e}",
                'analysis': "An unexpected error occurred. Please try again or contact support."
            }

class FallbackAIService:
    def analyze_symptoms(self, symptoms_text):
        # Simple rule-based fallback when Gemini is unavailable
        return {
            'success': True,
            'analysis': f"""
## Symptom Analysis

Based on your description: "{symptoms_text}"

## Important Note
Our AI medical assistant is currently unavailable. 

## General Advice
- Rest well and stay hydrated
- Monitor your symptoms
- Contact a healthcare professional for proper diagnosis
- Seek immediate help for severe symptoms like chest pain or difficulty breathing

## Next Steps
Please try again later or consult with one of our verified doctors.
            """,
            'is_fallback': True
        }

gemini_ai_service = GeminiAIService()
fallback_service = FallbackAIService()
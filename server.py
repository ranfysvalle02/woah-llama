#server.py
from openai import OpenAI
from typing import Optional, List, Dict, Any
#from openai import AzureOpenAI

class UnifiedLLM:
    def __init__(
        self,
        service: str = "ollama",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 100,
        model: str = "llama3.2",
    ):
        self.service = service.lower()
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.api_key = api_key
        self.base_url = base_url
        
        if self.service == "ollama":
            self.client = OpenAI(
                base_url="http://localhost:11434/v1",
                api_key="ollama" # dummy key
            )
        elif self.service == "azure":
            self.client = AzureOpenAI(
                api_key=self.api_key,
                api_version="2024-10-21",
                azure_endpoint=self.base_url
            )
        else:  # Default to OpenAI
            self.client = OpenAI(api_key=api_key, base_url=base_url)

    def chat_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error: {str(e)}"

    def __call__(self, prompt: str) -> str:
        messages = [
            {"role": "system", "content": "Perform the translation task. Only respond with translated text.DO NOT MAKE UP ANY PART OF YOUR RESPONSE. ONLY RESPOND WITH TRANSLATED TEXT."},
            {"role": "user", "content":prompt}
        ]
        return self.chat_completion(messages)
   

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

ollama_llm = UnifiedLLM()

@app.route('/q', methods=['GET', 'POST'])
def explain():
    if request.method == 'POST':
        data = request.get_json()
        prompt = data.get('prompt')
    elif request.method == 'GET':
        prompt = request.args.get('prompt')
    else:
        return jsonify({'error': 'Invalid method'}), 405

    response = ollama_llm(prompt)
    return jsonify({'response': response})

if __name__ == '__main__':
    app.run(debug=True)

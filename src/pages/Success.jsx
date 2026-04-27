import { useNavigate } from "react-router-dom";

const Success = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Assinatura Confirmada!</h1>
        <p className="text-gray-600 mb-8">
          Parabéns, Luan! Seu acesso ao <strong>Valora Finance Premium</strong> foi liberado. Prepare-se para dominar
          suas finanças com IA.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          Ir para o Dashboard
        </button>
      </div>
    </div>
  );
};

export default Success;


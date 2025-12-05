import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, CheckCircle, AlertCircle, Loader2, XCircle, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DebugStep {
  step: number;
  name: string;
  status: "success" | "error" | "warning";
  message: string;
  data?: any;
  duration?: number;
}

interface DebugResult {
  success: boolean;
  totalDuration: number;
  steps: DebugStep[];
  resultado?: {
    questoes: Record<string, string>;
    totalQuestoes: number;
    questoesRespondidas: number;
    taxaDeteccao: string;
  };
  error?: string;
}

export default function DebugPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<DebugResult | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
    maxFiles: 1,
  });

  const testOMR = async () => {
    if (!file) return;

    setIsProcessing(true);
    setResult(null);
    setCurrentStep(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/debug/omr", {
        method: "POST",
        body: formData,
      });

      const data: DebugResult = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        totalDuration: 0,
        steps: [{
          step: 0,
          name: "Erro de conexão",
          status: "error",
          message: error instanceof Error ? error.message : "Erro desconhecido",
        }],
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500">Sucesso</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      case "warning":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Aviso</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  // Renderizar grid de questões
  const renderQuestionGrid = (questoes: Record<string, string>) => {
    const questoesArray = Object.entries(questoes).map(([num, resp]) => ({
      num: parseInt(num),
      resp: resp || "-"
    })).sort((a, b) => a.num - b.num);

    // 6 colunas x 15 linhas = 90 questões (padrão ENEM)
    const columns = 6;
    const rows = 15;
    const grid: Array<Array<{num: number, resp: string} | null>> = [];

    for (let row = 0; row < rows; row++) {
      grid[row] = [];
      for (let col = 0; col < columns; col++) {
        const index = col * rows + row;
        grid[row][col] = questoesArray[index] || null;
      }
    }

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold mb-3 text-center">Gabarito Detectado (6 colunas × 15 questões)</h4>
        <table className="w-full border-collapse">
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => {
                  if (!cell) {
                    return (
                      <td key={colIndex} className="border border-gray-300 p-2 text-center text-gray-400">
                        -
                      </td>
                    );
                  }
                  
                  const isAnswered = cell.resp && cell.resp !== '-';
                  return (
                    <td 
                      key={colIndex} 
                      className={`border border-gray-300 p-2 text-center ${
                        isAnswered ? 'bg-green-100 font-semibold' : 'bg-red-50'
                      }`}
                    >
                      <div className="text-xs text-gray-500">Q{cell.num}</div>
                      <div className={`text-lg ${isAnswered ? 'text-green-700' : 'text-red-500'}`}>
                        {cell.resp}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-sm text-gray-600 text-center">
          <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded mr-2">■ Respondida</span>
          <span className="inline-block px-2 py-1 bg-red-50 text-red-500 rounded">■ Não detectada</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Debug OMR - Análise Passo a Passo
            </CardTitle>
            <CardDescription>
              Teste a leitura OMR e veja cada etapa do processamento em detalhes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Upload Area */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              {file ? (
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">
                    Arraste um PDF ou imagem aqui
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ou clique para selecionar
                  </p>
                </div>
              )}
            </div>

            {/* Botão de teste */}
            {file && (
              <Button
                onClick={testOMR}
                disabled={isProcessing}
                className="w-full mt-4"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Testar OMR
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Resultados */}
        {result && (
          <>
            {/* Resumo Geral */}
            <Alert className={`mb-6 ${result.success ? 'border-green-500' : 'border-red-500'}`}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {result.success ? "✅ Processamento Concluído" : "❌ Erro no Processamento"}
              </AlertTitle>
              <AlertDescription>
                Tempo total: {result.totalDuration || 0}ms
                {result.resultado && (
                  <div className="mt-2 font-semibold">
                    Taxa de detecção: {result.resultado.taxaDeteccao} ({result.resultado.questoesRespondidas}/{result.resultado.totalQuestoes} questões)
                  </div>
                )}
              </AlertDescription>
            </Alert>

            {/* Etapas */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Etapas do Processamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.steps?.map((step, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="mt-1">
                        {getStepIcon(step.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold">
                            Etapa {step.step}: {step.name}
                          </h4>
                          {getStatusBadge(step.status)}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{step.message}</p>
                        {step.duration !== undefined && (
                          <p className="text-xs text-gray-500">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {step.duration}ms
                          </p>
                        )}
                        {step.data && (
                          <details className="mt-2">
                            <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                              Ver detalhes técnicos
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                              {JSON.stringify(step.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Grid de Questões */}
            {result.resultado && result.resultado.questoes && (
              <Card>
                <CardHeader>
                  <CardTitle>Visualização do Gabarito</CardTitle>
                  <CardDescription>
                    Layout ENEM: 6 colunas × 15 questões = 90 total
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renderQuestionGrid(result.resultado.questoes)}
                  
                  {/* Análise */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold mb-2">📊 Análise</h4>
                    <ul className="text-sm space-y-1">
                      <li>✅ Questões detectadas: {result.resultado.questoesRespondidas}</li>
                      <li>📝 Total de questões: {result.resultado.totalQuestoes}</li>
                      <li>📈 Taxa de detecção: <strong>{result.resultado.taxaDeteccao}</strong></li>
                      <li className="mt-3 text-xs text-gray-600">
                        {parseFloat(result.resultado.taxaDeteccao) >= 98 
                          ? "✨ Excelente! OMR está calibrado corretamente."
                          : "⚠️ Taxa abaixo do esperado (≥98%). Considere ajustar a calibração."}
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

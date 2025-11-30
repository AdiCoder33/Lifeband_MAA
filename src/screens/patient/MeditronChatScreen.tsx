// Simple chat UI to ask Meditron-7B via the local OpenAI-compatible server.
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import askMeditron from '../../services/meditronApi';
import { colors, spacing, typography } from '../../theme/theme';

const MeditronChatScreen: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAsk = async () => {
    setError(null);
    setAnswer('');
    if (!question.trim()) {
      setError('Please enter a question.');
      return;
    }
    setLoading(true);
    try {
      const resp = await askMeditron(question);
      setAnswer(resp);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Ask Meditron</Text>
        <Text style={styles.subtitle}>Pregnancy-safe answers in simple language.</Text>
      </View>

      <View style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder="Type your question about pregnancy..."
          placeholderTextColor={colors.textSecondary}
          multiline
          value={question}
          onChangeText={setQuestion}
        />
        <TouchableOpacity style={styles.button} onPress={onAsk} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Ask Meditron</Text>}
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.answerLabel}>Answer</Text>
      <ScrollView style={styles.answerBox} contentContainerStyle={{ padding: spacing.md }}>
        {loading && !answer ? (
          <Text style={styles.loadingText}>Thinking…</Text>
        ) : answer ? (
          <Text style={styles.answerText}>{answer}</Text>
        ) : (
          <Text style={styles.placeholder}>Your reply will appear here.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    minHeight: 100,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.sm,
    textAlignVertical: 'top',
    color: colors.textPrimary,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
  },
  error: {
    marginTop: spacing.sm,
    color: colors.statusCritical || '#D32F2F',
  },
  answerLabel: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  answerBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  answerText: {
    color: colors.textPrimary,
    lineHeight: 20,
  },
  placeholder: {
    color: colors.textSecondary,
  },
  loadingText: {
    color: colors.textSecondary,
  },
});

export default MeditronChatScreen;

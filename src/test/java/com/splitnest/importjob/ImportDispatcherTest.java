package com.splitnest.importjob;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import org.junit.jupiter.api.Test;

class ImportDispatcherTest {
    @Test
    void queueRejectionDoesNotFailAnAlreadyCommittedUpload() {
        var repository = mock(ImportRepository.class);
        var worker = mock(ImportWorker.class);
        var dispatcher = new ImportDispatcher(repository, worker);
        UUID id = UUID.randomUUID();
        doThrow(new RejectedExecutionException("full")).when(worker).process(id);
        assertThatCode(() -> dispatcher.uploaded(new ImportQueued(id))).doesNotThrowAnyException();
        when(repository.pending()).thenReturn(List.of(id));
        assertThatCode(dispatcher::dispatchPending).doesNotThrowAnyException();
        verify(worker, org.mockito.Mockito.times(2)).process(id);
    }
}
